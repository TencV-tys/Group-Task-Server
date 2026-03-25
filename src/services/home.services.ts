// services/home.services.ts - COMPLETE UPDATED VERSION WITH ROTATION STATUS
import prisma from "../prisma";

export class HomeServices {

  // services/home.services.ts - UPDATED getHomeData method

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

    // Get user's group memberships with rotation status
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
                  where: { isRecurring: true, isDeleted: false } // ✅ Exclude deleted tasks
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

    // Check user's rotation status across groups
    const userInRotation = userMemberships.some(m => m.inRotation);
    const userIsAdmin = userMemberships.some(m => m.groupRole === "ADMIN");
    const groupsWhereUserInRotation = userMemberships.filter(m => m.inRotation).length;
    const groupsWhereUserIsAdmin = userMemberships.filter(m => m.groupRole === "ADMIN").length;

    // Calculate date ranges
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    // Get start of current week (Monday)
    const currentWeekStart = new Date(now);
    const day = currentWeekStart.getDay();
    const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
    currentWeekStart.setDate(diff);
    currentWeekStart.setHours(0, 0, 0, 0);
    
    // Get end of current week (Sunday)
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
    currentWeekEnd.setHours(23, 59, 59, 999);

    console.log(`📅 Current week: ${currentWeekStart.toISOString()} to ${currentWeekEnd.toISOString()}`);
    console.log(`📅 Today: ${today.toISOString()}`);

    // ✅ FIX: Count tasks due this week - EXCLUDE assignments from deleted tasks
    const tasksDueThisWeek = userInRotation ? await prisma.assignment.count({
      where: {
        userId: userId,
        completed: false,
        expired: false,
        dueDate: {
          gte: today,
          lte: currentWeekEnd
        },
        // ✅ Only count assignments that have a valid task (not deleted)
        taskId: { not: null }
      }
    }) : 0;

    console.log(`📊 Tasks due this week (from today): ${tasksDueThisWeek}`);

    // ✅ FIX: Count overdue tasks - EXCLUDE assignments from deleted tasks
    const overdueTasks = userInRotation ? await prisma.assignment.count({
      where: {
        userId: userId,
        completed: false,
        expired: false,
        dueDate: { lt: today },
        // ✅ Only count assignments that have a valid task (not deleted)
        taskId: { not: null }
      }
    }) : 0;

    console.log(`📊 Overdue tasks: ${overdueTasks}`);

    // ✅ FIX: Get current week assignments - EXCLUDE assignments from deleted tasks
    const currentWeekAssignments = userInRotation ? await prisma.assignment.findMany({
      where: {
        userId: userId,
        completed: false,
        expired: false,
        dueDate: {
          gte: currentWeekStart,
          lte: currentWeekEnd
        },
        // ✅ Only include assignments that have a valid task (not deleted)
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

    // Separate into overdue and upcoming
    const overdueAssignments = currentWeekAssignments.filter(
      assignment => assignment.dueDate < today
    );
    
    const upcomingAssignmentsThisWeek = currentWeekAssignments.filter(
      assignment => assignment.dueDate >= today
    );

    // ✅ FIX: Get completed tasks count - EXCLUDE assignments from deleted tasks
    const completedTasks = userInRotation ? await prisma.assignment.count({
      where: {
        userId: userId,
        completed: true,
        // ✅ Only count assignments that have a valid task (not deleted)
        taskId: { not: null }
      }
    }) : 0;

    // ✅ FIX: Get total assignments count - EXCLUDE assignments from deleted tasks
    const totalTasks = userInRotation ? await prisma.assignment.count({
      where: { 
        userId: userId,
        // ✅ Only count assignments that have a valid task (not deleted)
        taskId: { not: null }
      }
    }) : 0;

    // Get pending swap requests - only if user is in rotation
    const swapRequests = userInRotation ? await prisma.swapRequest.count({
      where: {
        assignment: {
          userId: userId,
          // ✅ Only count swaps for assignments that have a valid task
          taskId: { not: null }
        },
        status: "PENDING"
      }
    }) : 0;

    // Get recent activity (notifications) - no change needed
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

    // Calculate points earned this week - only for valid tasks
    const pointsThisWeek = userInRotation ? await this.getWeeklyPoints(userId, currentWeekStart) : 0;

    // Format groups with rotation info
    const groups = await Promise.all(userMemberships.map(async (member) => {
      const group = member.group;
      const tasksForThisGroup = currentWeekAssignments.filter(
        assignment => assignment.task?.group?.id === group.id
      );

      // Get rotation stats for this group
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

    // Sort groups by activity
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
      // ===== NEW: Get user's rotation status =====
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
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Get completed tasks this week - only if user is in rotation
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

      // Get pending tasks for this week - only if user is in rotation
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

      // Calculate points
      const totalPoints = completedThisWeek.reduce((sum, assignment) => {
        const points = assignment.task?.points || assignment.taskPoints || 0;
        return sum + points;
      }, 0);

      // Group by day
      const byDay: Record<string, any> = {};
      completedThisWeek.forEach(assignment => {
        if (assignment.completedAt) {
          const day = assignment.completedAt.toLocaleDateString('en-US', { weekday: 'short' });
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
          // ===== NEW: Add user role info =====
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
              completedAt: item.completedAt
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

  // ===== NEW: Helper method to get weekly points =====
  private static async getWeeklyPoints(userId: string, weekStart: Date): Promise<number> {
    try {
      const completedAssignments = await prisma.assignment.findMany({
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
      return 0;
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

      return completedAssignments.reduce((sum, a) => {
        const points = a.task?.points || a.taskPoints || 0;
        return sum + points;
      }, 0);
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