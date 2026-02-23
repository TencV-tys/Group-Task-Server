// services/home.services.ts - COMPLETE UPDATED VERSION
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

      // Get user's group memberships with rotation info
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
                    where: { isRecurring: true }
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

      // Get current week assignments for user (tasks due this week)
      const now = new Date();
      const currentWeekStart = new Date(now);
      currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + 1);
      currentWeekStart.setHours(0, 0, 0, 0);

      const currentWeekEnd = new Date(currentWeekStart);
      currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
      currentWeekEnd.setHours(23, 59, 59, 999);

      // Get assignments for current rotation week - FIXED with null checks
      const currentWeekAssignments = await prisma.assignment.findMany({
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
                gte: currentWeekStart,
                lte: currentWeekEnd
              }
            }
          ]
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
        }
      });

      const tasksDueThisWeek = currentWeekAssignments.length;
      
      // Get overdue tasks (due before today)
      const overdueTasks = await prisma.assignment.count({
        where: {
          userId: userId,
          completed: false,
          dueDate: { lt: now }
        }
      });

      // Get completed tasks count
      const completedTasks = await prisma.assignment.count({
        where: {
          userId: userId,
          completed: true
        }
      });

      // Get total assignments count
      const totalTasks = await prisma.assignment.count({
        where: { userId: userId }
      });

      // Get pending swap requests
      const swapRequests = await prisma.swapRequest.count({
        where: {
          assignment: {
            userId: userId
          },
          status: "PENDING"
        }
      });

      // Get recent activity (notifications)
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

      // Get upcoming rotations (next week's tasks)
      const nextWeekStart = new Date(currentWeekStart);
      nextWeekStart.setDate(nextWeekStart.getDate() + 7);
      
      const nextWeekEnd = new Date(currentWeekEnd);
      nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);

      // Get upcoming assignments - FIXED with null checks
      const upcomingAssignments = await prisma.assignment.findMany({
        where: {
          userId: userId,
          OR: [
            {
              weekStart: { gte: nextWeekStart }
            },
            {
              dueDate: {
                gte: nextWeekStart,
                lte: nextWeekEnd
              }
            }
          ]
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              points: true,
              timeOfDay: true,
              dayOfWeek: true
            }
          }
        },
        take: 3
      });

      // Calculate points earned this week
      const completedAssignmentsThisWeek = await prisma.assignment.findMany({
        where: {
          userId: userId,
          completed: true,
          completedAt: {
            gte: currentWeekStart
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

      const pointsThisWeek = completedAssignmentsThisWeek.reduce((sum, assignment) => 
        sum + (assignment.task.points || 0), 0
      );

      // Format groups with rotation info
      const groups = userMemberships.map(member => {
        const group = member.group;
        const tasksForThisGroup = currentWeekAssignments.filter(
          assignment => assignment.task.group.id === group.id
        );

        return {
          id: group.id,
          name: group.name,
          avatarUrl: group.avatarUrl,
          role: member.groupRole,
          rotationOrder: member.rotationOrder,
          isActive: member.isActive,
          currentRotationWeek: group.currentRotationWeek,
          lastRotationUpdate: group.lastRotationUpdate,
          stats: {
            totalTasks: group._count.tasks,
            totalMembers: group._count.members,
            yourTasksThisWeek: tasksForThisGroup.length,
            recurringTasks: group._count.tasks
          }
        };
      });

      // Sort groups by activity
      groups.sort((a, b) => b.stats.yourTasksThisWeek - a.stats.yourTasksThisWeek);

      // Get leaderboard data - get all completed assignments in user's groups this week
      const allCompletedAssignments = await prisma.assignment.findMany({
        where: {
          completed: true,
          completedAt: {
            gte: currentWeekStart
          },
          task: {
            groupId: {
              in: userMemberships.map(m => m.groupId)
            }
          }
        },
        include: {
          task: {
            select: {
              points: true
            }
          },
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true
            }
          }
        }
      });

      // Group by user and calculate completed tasks and total points
      const leaderboardMap = new Map();
      
      allCompletedAssignments.forEach(assignment => {
        const userId = assignment.userId;
        if (!leaderboardMap.has(userId)) {
          leaderboardMap.set(userId, {
            user: assignment.user,
            completedTasks: 0,
            totalPoints: 0
          });
        }
        const userData = leaderboardMap.get(userId);
        userData.completedTasks++;
        userData.totalPoints += assignment.task.points || 0;
      });

      // Convert to array, sort by total points, and take top 5
      const leaderboard = Array.from(leaderboardMap.values())
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .slice(0, 5)
        .map(item => ({
          user: item.user,
          completedTasks: item.completedTasks,
          totalPoints: item.totalPoints,
          isCurrentUser: item.user.id === userId
        }));

      return {
        success: true,
        data: {
          user: {
            ...user,
            groupsCount,
            pointsThisWeek,
            totalPoints: await this.getTotalPoints(userId)
          },
          stats: {
            groupsCount,
            tasksDueThisWeek,
            overdueTasks,
            completedTasks,
            totalTasks,
            swapRequests,
            completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
            pointsThisWeek
          },
          currentWeekTasks: currentWeekAssignments.map(assignment => ({
            id: assignment.id,
            taskId: assignment.task.id,
            title: assignment.task.title,
            points: assignment.task.points,
            timeOfDay: assignment.task.timeOfDay,
            dayOfWeek: assignment.task.dayOfWeek,
            dueDate: assignment.dueDate,
            completed: assignment.completed,
            groupName: assignment.task.group.name,
            groupId: assignment.task.group.id,
            weekStart: assignment.weekStart || null,
            weekEnd: assignment.weekEnd || null
          })),
          upcomingTasks: upcomingAssignments.map(assignment => ({
            id: assignment.id,
            taskId: assignment.task.id,
            title: assignment.task.title,
            points: assignment.task.points,
            timeOfDay: assignment.task.timeOfDay,
            dayOfWeek: assignment.task.dayOfWeek,
            weekStart: assignment.weekStart || null,
            weekEnd: assignment.weekEnd || null,
            startsInDays: assignment.weekStart 
              ? Math.ceil((assignment.weekStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
              : null
          })),
          groups: groups,
          leaderboard: leaderboard,
          recentActivity: recentActivity.map(activity => ({
            ...activity,
            icon: this.getActivityIcon(activity.type),
            timeAgo: this.getTimeAgo(activity.createdAt)
          })),
          rotationInfo: {
            currentWeekStart,
            currentWeekEnd,
            nextRotationStarts: new Date(currentWeekEnd.getTime() + 1000),
            daysUntilNextRotation: Math.ceil((currentWeekEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
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
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Get completed tasks this week
      const completedThisWeek = await prisma.assignment.findMany({
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
      });

      // Get pending tasks for this week - FIXED with null checks
      const pendingThisWeek = await prisma.assignment.findMany({
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
      });

      // Calculate points
      const totalPoints = completedThisWeek.reduce((sum, assignment) => 
        sum + (assignment.task.points || 0), 0
      );

      // Group by day
      const byDay: Record<string, any> = {};
      completedThisWeek.forEach(assignment => {
        if (assignment.completedAt) {
          const day = assignment.completedAt.toLocaleDateString('en-US', { weekday: 'short' });
          if (!byDay[day]) {
            byDay[day] = { count: 0, points: 0 };
          }
          byDay[day].count++;
          byDay[day].points += assignment.task.points || 0;
        }
      });

      return {
        success: true,
        data: {
          completedTasks: completedThisWeek.length,
          pendingTasks: pendingThisWeek.length,
          totalPoints,
          completedTasksList: completedThisWeek.map(task => ({
            title: task.task.title,
            points: task.task.points,
            group: task.task.group.name,
            completedAt: task.completedAt
          })),
          pendingTasksList: pendingThisWeek.map(task => ({
            title: task.task.title,
            points: task.task.points,
            timeOfDay: task.task.timeOfDay,
            dayOfWeek: task.task.dayOfWeek,
            dueDate: task.dueDate
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

  // Helper method to get total points
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

      return completedAssignments.reduce((sum, a) => sum + (a.task.points || 0), 0);
    } catch (error) {
      return 0;
    }
  }

  // Helper method to get activity icon
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

  // Helper method to get time ago string
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