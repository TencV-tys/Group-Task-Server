// services/home.services.ts - COMPLETE FIXED VERSION

import prisma from "../prisma";

export class HomeServices {

  static async getHomeData(userId: string) {
    try {
      console.log(`Fetching home data for user: ${userId}`);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true
        }
      });

      if (!user) {
        return {
          success: false,
          message: "User not found"
        };
      }

      const userMemberships = await prisma.groupMember.findMany({
        where: { userId: userId },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              currentRotationWeek: true,
              lastRotationUpdate: true,
              _count: {
                select: {
                  tasks: {
                    where: { isRecurring: true, isDeleted: false }
                  },
                  members: true
                }
              }
            }
          }
        },
        orderBy: { joinedAt: 'desc' }
      });

      const groupsCount = userMemberships.length;

      const userInRotation = userMemberships.some(m => m.inRotation);
      const userIsAdmin = userMemberships.some(m => m.groupRole === "ADMIN");
      const groupsWhereUserInRotation = userMemberships.filter(m => m.inRotation).length;
      const groupsWhereUserIsAdmin = userMemberships.filter(m => m.groupRole === "ADMIN").length;

      const now = new Date();

      // ✅ Use UTC for today's boundaries
      const today = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
      ));

      // ✅ Use UTC for week start (Monday)
      const currentUTCDay = now.getUTCDay(); // 0 = Sunday
      const daysToMonday = currentUTCDay === 0 ? 6 : currentUTCDay - 1;
      const currentWeekStart = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysToMonday,
        0, 0, 0, 0
      ));

      // ✅ Use UTC for week end (Sunday)
      const currentWeekEnd = new Date(currentWeekStart);
      currentWeekEnd.setUTCDate(currentWeekStart.getUTCDate() + 6);
      currentWeekEnd.setUTCHours(23, 59, 59, 999);

      console.log(`📅 Current week: ${currentWeekStart.toISOString()} to ${currentWeekEnd.toISOString()}`);
      console.log(`📅 Today: ${today.toISOString()}`);

      const tasksDueThisWeek = userInRotation ? await prisma.assignment.count({
        where: {
          userId: userId,
          completed: false,
          expired: false,
          dueDate: {
            gte: today,
            lte: currentWeekEnd
          },
          taskId: { not: null }
        }
      }) : 0;

      console.log(`📊 Tasks due this week (from today): ${tasksDueThisWeek}`);

      const overdueTasks = userInRotation ? await prisma.assignment.count({
        where: {
          userId: userId,
          completed: false,
          expired: false,
          dueDate: { lt: today },
          taskId: { not: null }
        }
      }) : 0;

      console.log(`📊 Overdue tasks: ${overdueTasks}`);

      const currentWeekAssignments = userInRotation ? await prisma.assignment.findMany({
        where: {
          userId: userId,
          completed: false,
          expired: false,
          dueDate: {
            gte: currentWeekStart,
            lte: currentWeekEnd
          },
          taskId: { not: null }
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              points: true,
              timeOfDay: true,
              dayOfWeek: true,
              group: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: { dueDate: 'asc' }
      }) : [];

      const overdueAssignments = currentWeekAssignments.filter(
        assignment => assignment.dueDate < today
      );
      
      const upcomingAssignmentsThisWeek = currentWeekAssignments.filter(
        assignment => assignment.dueDate >= today
      );

      const completedTasks = userInRotation ? await prisma.assignment.count({
        where: {
          userId: userId,
          completed: true,
          taskId: { not: null }
        }
      }) : 0;

      const totalTasks = userInRotation ? await prisma.assignment.count({
        where: { 
          userId: userId,
          taskId: { not: null }
        }
      }) : 0;

      const swapRequests = userInRotation ? await prisma.swapRequest.count({
        where: {
          assignment: {
            userId: userId,
            taskId: { not: null }
          },
          status: "PENDING"
        }
      }) : 0;

      const recentActivity = await prisma.userNotification.findMany({
        where: { userId: userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          createdAt: true,
          read: true
        }
      });

      const pointsThisWeek = userInRotation ? await this.getWeeklyPoints(userId, currentWeekStart) : 0;

      const groups = await Promise.all(userMemberships.map(async (member) => {
        const group = member.group;
        const tasksForThisGroup = currentWeekAssignments.filter(
          assignment => assignment.task?.group?.id === group.id
        );

        const membersInRotation = await prisma.groupMember.count({
          where: { 
            groupId: group.id, 
            inRotation: true 
          }
        });

        const adminsInGroup = await prisma.groupMember.count({
          where: { 
            groupId: group.id, 
            groupRole: "ADMIN" 
          }
        });

        return {
          id: group.id,
          name: group.name,
          avatarUrl: group.avatarUrl,
          role: member.groupRole,
          rotationOrder: member.rotationOrder,
          isActive: member.isActive,
          inRotation: member.inRotation,
          currentRotationWeek: group.currentRotationWeek,
          lastRotationUpdate: group.lastRotationUpdate,
          stats: {
            totalTasks: group._count.tasks,
            totalMembers: group._count.members,
            yourTasksThisWeek: tasksForThisGroup.length,
            recurringTasks: group._count.tasks,
            membersInRotation,
            admins: adminsInGroup
          }
        };
      }));

      groups.sort((a, b) => b.stats.yourTasksThisWeek - a.stats.yourTasksThisWeek);

      return {
        success: true,
        data: {
          user: {
            ...user,
            groupsCount,
            pointsThisWeek,
            totalPoints: userInRotation ? await this.getTotalPoints(userId) : 0,
            inRotation: userInRotation,
            isAdmin: userIsAdmin,
            groupsWhereUserInRotation,
            groupsWhereUserIsAdmin
          },
          stats: {
            groupsCount,
            tasksDueThisWeek,
            overdueTasks,
            completedTasks,
            totalTasks,
            swapRequests,
            completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
            pointsThisWeek,
            userInRotation,
            isAdmin: userIsAdmin
          },
          currentWeekTasks: upcomingAssignmentsThisWeek
            .filter(assignment => assignment.task !== null)
            .map(assignment => ({
              id: assignment.id,
              taskId: assignment.task!.id,
              title: assignment.task!.title,
              points: assignment.task!.points,
              timeOfDay: assignment.task!.timeOfDay,
              dayOfWeek: assignment.task!.dayOfWeek,
              dueDate: assignment.dueDate,
              completed: assignment.completed,
              groupName: assignment.task!.group?.name || 'Unknown Group',
              groupId: assignment.task!.group?.id,
              isOverdue: false,
              daysLeft: Math.ceil((assignment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            })),
          overdueTasks: overdueAssignments
            .filter(assignment => assignment.task !== null)
            .map(assignment => ({
              id: assignment.id,
              taskId: assignment.task!.id,
              title: assignment.task!.title,
              points: assignment.task!.points,
              timeOfDay: assignment.task!.timeOfDay,
              dayOfWeek: assignment.task!.dayOfWeek,
              dueDate: assignment.dueDate,
              completed: assignment.completed,
              groupName: assignment.task!.group?.name || 'Unknown Group',
              groupId: assignment.task!.group?.id,
              isOverdue: true,
              daysOverdue: Math.floor((now.getTime() - assignment.dueDate.getTime()) / (1000 * 60 * 60 * 24))
            })),
          groups: groups,
          recentActivity: recentActivity.map(activity => ({
            ...activity,
            icon: this.getActivityIcon(activity.type),
            timeAgo: this.getTimeAgo(activity.createdAt)
          })),
          rotationInfo: {
            currentWeekStart,
            currentWeekEnd,
            nextRotationStarts: new Date(currentWeekEnd.getTime() + 1000),
            daysUntilNextRotation: Math.max(0, Math.ceil((currentWeekEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          }
        }
      };

    } catch (e: any) {
      console.error("HomeServices error:", e);
      return {
        success: false,
        message: e.message || "Internal server error"
      };
    }
  }
    
  static async getWeeklySummary(userId: string) {
    try {
      const userMemberships = await prisma.groupMember.findMany({
        where: { userId: userId },
        select: {
          inRotation: true,
          groupRole: true,
          groupId: true
        }
      });

      const inRotation = userMemberships.some(m => m.inRotation);
      const isAdmin = userMemberships.some(m => m.groupRole === "ADMIN");

      const now = new Date();

      // ✅ Use UTC for week boundaries
      const currentUTCDay = now.getUTCDay();
      const daysToMonday = currentUTCDay === 0 ? 6 : currentUTCDay - 1;

      const weekStart = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysToMonday,
        0, 0, 0, 0
      ));

      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
      weekEnd.setUTCHours(23, 59, 59, 999);

      const completedThisWeek = inRotation ? await prisma.assignment.findMany({
        where: {
          userId: userId,
          completed: true,
          completedAt: {
            gte: weekStart
          }
        },
        include: {
          task: {
            select: {
              title: true,
              points: true,
              group: {
                select: {
                  name: true
                }
              }
            }
          }
        },
        orderBy: { completedAt: 'desc' }
      }) : [];

      const pendingThisWeek = inRotation ? await prisma.assignment.findMany({
        where: {
          userId: userId,
          completed: false,
          OR: [
            {
              AND: [
                { weekStart: { lte: now } },
                { weekEnd: { gte: now } }
              ]
            },
            {
              dueDate: {
                gte: weekStart,
                lte: weekEnd
              }
            }
          ]
        },
        include: {
          task: {
            select: {
              title: true,
              points: true,
              timeOfDay: true,
              dayOfWeek: true
            }
          }
        }
      }) : [];

      const totalPoints = completedThisWeek
        .filter(assignment => assignment.verified === true)
        .reduce((sum, assignment) => {
          const points = assignment.task?.points || assignment.taskPoints || 0;
          return sum + points;
        }, 0);

      const byDay: Record<string, any> = {};
      completedThisWeek
        .filter(assignment => assignment.verified === true)
        .forEach(assignment => {
          if (assignment.completedAt) {
            // ✅ Use UTC day for grouping
            const day = assignment.completedAt.toLocaleDateString('en-US', { 
              weekday: 'short', 
              timeZone: 'UTC' 
            });
            if (!byDay[day]) {
              byDay[day] = { count: 0, points: 0 };
            }
            byDay[day].count++;
            const points = assignment.task?.points || assignment.taskPoints || 0;
            byDay[day].points += points;
          }
        });

      return {
        success: true,
        data: {
          completedTasks: completedThisWeek.length,
          pendingTasks: pendingThisWeek.length,
          totalPoints,
          userRole: {
            inRotation,
            isAdmin,
            hasTasks: completedThisWeek.length > 0 || pendingThisWeek.length > 0
          },
          completedTasksList: completedThisWeek
            .filter(item => item.task !== null)
            .map(item => ({
              title: item.task!.title,
              points: item.task!.points,
              group: item.task!.group?.name || 'Unknown Group',
              completedAt: item.completedAt,
              verified: item.verified
            })),
          pendingTasksList: pendingThisWeek
            .filter(item => item.task !== null)
            .map(item => ({
              title: item.task!.title,
              points: item.task!.points,
              timeOfDay: item.task!.timeOfDay,
              dayOfWeek: item.task!.dayOfWeek,
              dueDate: item.dueDate
            })),
          dailyStats: byDay
        }
      };

    } catch (error: any) {
      console.error("HomeServices.getWeeklySummary error:", error);
      return {
        success: false,
        message: error.message || "Error getting weekly summary"
      };
    }
  }

  // ✅ Only verified assignments count for points
  private static async getWeeklyPoints(userId: string, weekStart: Date): Promise<number> {
    try {
      const completedAssignments = await prisma.assignment.findMany({
        where: {
          userId: userId,
          completed: true,
          verified: true,
          completedAt: {
            gte: weekStart
          }
        },
        include: {
          task: {
            select: {
              points: true
            }
          }
        }
      });

      return completedAssignments.reduce((sum, assignment) => {
        const points = assignment.task?.points || assignment.taskPoints || 0;
        return sum + points;
      }, 0);
    } catch (error) {
      console.error("Error calculating weekly points:", error);
      return 0;
    }
  }

  // ✅ Only verified assignments count for total points
  private static async getTotalPoints(userId: string): Promise<number> {
    try {
      const completedAssignments = await prisma.assignment.findMany({
        where: {
          userId: userId,
          completed: true,
          verified: true
        },
        include: {
          task: {
            select: {
              points: true
            }
          }
        }
      });

      return completedAssignments.reduce((sum, a) => {
        const points = a.task?.points || a.taskPoints || 0;
        return sum + points;
      }, 0);
    } catch (error) {
      console.error("Error calculating total points:", error);
      return 0;
    }
  }

  private static getActivityIcon(type: string): string {
    const icons: Record<string, string> = {
      'SUBMISSION_VERIFIED': 'check-circle',
      'SUBMISSION_REJECTED': 'close-circle',
      'TASK_ASSIGNED': 'clipboard-check',
      'TASK_COMPLETED': 'check',
      'SWAP_REQUEST': 'swap-horizontal',
      'SWAP_ACCEPTED': 'handshake',
      'POINTS_EARNED': 'star',
      'GROUP_INVITE': 'account-plus',
      'NEW_MEMBER': 'account-plus',
      'FEEDBACK_RESPONSE': 'message-reply'
    };
    return icons[type] || 'bell';
  }

  private static getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(date).toLocaleDateString();
  }
}