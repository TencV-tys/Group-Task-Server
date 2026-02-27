// services/home.services.ts - COMPLETE UPDATED VERSION
import prisma from "../prisma";

export class HomeServices {
 // services/home.services.ts - FIXED with proper day-by-day counting

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

    // Get user's group memberships
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

    // ===== FIXED: Calculate date ranges correctly =====
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    // Get start of current week (Monday)
    const currentWeekStart = new Date(now);
    const day = currentWeekStart.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    currentWeekStart.setDate(diff);
    currentWeekStart.setHours(0, 0, 0, 0);
    
    // Get end of current week (Sunday)
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
    currentWeekEnd.setHours(23, 59, 59, 999);

    console.log(`📅 Current week: ${currentWeekStart.toISOString()} to ${currentWeekEnd.toISOString()}`);
    console.log(`📅 Today: ${today.toISOString()}`);

    // ===== FIXED: Count tasks due this week (from today until Sunday) =====
    // Tasks due from today until the end of the week (NOT COMPLETED)
    const tasksDueThisWeek = await prisma.assignment.count({
      where: {
        userId: userId,
        completed: false,
        dueDate: {
          gte: today, // From today (not the start of week)
          lte: currentWeekEnd // Until end of week
        }
      }
    });

    console.log(`📊 Tasks due this week (from today): ${tasksDueThisWeek}`);

    // ===== FIXED: Count overdue tasks (due before today and not completed) =====
    const overdueTasks = await prisma.assignment.count({
      where: {
        userId: userId,
        completed: false,
        dueDate: { lt: today } // Before today
      }
    });

    console.log(`📊 Overdue tasks: ${overdueTasks}`);

    // Get current week assignments for display (including overdue for separate display)
    const currentWeekAssignments = await prisma.assignment.findMany({
      where: {
        userId: userId,
        completed: false,
        dueDate: {
          gte: currentWeekStart,
          lte: currentWeekEnd
        }
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
    });

    // Separate into overdue and upcoming for better UX
    const overdueAssignments = currentWeekAssignments.filter(
      assignment => assignment.dueDate < today
    );
    
    const upcomingAssignmentsThisWeek = currentWeekAssignments.filter(
      assignment => assignment.dueDate >= today
    );

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
          tasksDueThisWeek, // ← This decreases day by day as tasks become overdue
          overdueTasks,     // ← This increases as tasks are missed
          completedTasks,
          totalTasks,
          swapRequests,
          completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
          pointsThisWeek
        },
        currentWeekTasks: upcomingAssignmentsThisWeek.map(assignment => ({
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
          isOverdue: false,
          daysLeft: Math.ceil((assignment.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        })),
        overdueTasks: overdueAssignments.map(assignment => ({
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