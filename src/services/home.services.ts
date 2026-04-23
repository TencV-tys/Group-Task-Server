// services/home.services.ts - COMPLETE FIXED VERSION WITH ROLLING 7-DAY WINDOW

import prisma from "../prisma";
import { Assignment, Task, TimeSlot } from '@prisma/client';

type AssignmentWithTaskAndTimeSlot = Assignment & {
  task: (Pick<Task, 'id' | 'title' | 'points' | 'executionFrequency' | 'groupId'> & {
    group: { id: string; name: string; } | null;
    timeSlots?: Array<Pick<TimeSlot, 'id' | 'startTime' | 'endTime' | 'label' | 'points'>>;
  }) | null;
  timeSlot: Pick<TimeSlot, 'id' | 'startTime' | 'endTime' | 'label' | 'points'> | null;
};

export class HomeServices {

  static async getHomeData(userId: string) {
    try {
      console.log('\n🔵🔵🔵 [getHomeData] START 🔵🔵🔵');
      console.log(`👤 User ID: ${userId}`);

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

      // ✅ FIXED: Use rolling 7-day window instead of calendar week
      const todayStartUTC = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
      ));
      
      const next7DaysEnd = new Date(todayStartUTC);
      next7DaysEnd.setUTCDate(todayStartUTC.getUTCDate() + 7);
      next7DaysEnd.setUTCHours(23, 59, 59, 999);

      console.log(`📅 Rolling 7-day window: ${todayStartUTC.toISOString()} to ${next7DaysEnd.toISOString()}`);

      // ✅ Get ALL assignments for the next 7 days (no filters)
      const allAssignments = await prisma.assignment.findMany({
        where: {
          userId: userId,
          taskId: { not: null },
          dueDate: {
            gte: todayStartUTC,
            lt: next7DaysEnd
          }
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              points: true,
              executionFrequency: true,
              timeSlots: {
                select: {
                  id: true,
                  startTime: true,
                  endTime: true,
                  label: true,
                  points: true
                }
              },
              group: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
          timeSlot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              label: true,
              points: true
            }
          }
        },
        orderBy: { dueDate: 'asc' }
      });

      const typedAssignments = allAssignments as any[];

      // ✅ Count ALL assignments (no filtering)
      const tasksDueInNext7Days = typedAssignments.length;
      console.log(`📊 TOTAL Assignments in next 7 days: ${tasksDueInNext7Days}`);
      
      // ✅ Log each assignment with details
      console.log(`\n📋 DETAILED ASSIGNMENT LIST:`);
      typedAssignments.forEach((a, idx) => {
        console.log(`   ${idx + 1}. ID: ${a.id.substring(0, 8)}...`);
        console.log(`      Title: ${a.task?.title || 'N/A'}`);
        console.log(`      Due Date: ${a.dueDate.toISOString()}`);
        console.log(`      Completed: ${a.completed}`);
        console.log(`      Verified: ${a.verified}`);
        console.log(`      PhotoUrl: ${a.photoUrl ? 'Yes' : 'No'}`);
        console.log(`      Expired: ${a.expired}`);
      });

      // ✅ Overdue assignments (due date < today)
      const overdueAssignments = typedAssignments.filter(
        assignment => new Date(assignment.dueDate) < todayStartUTC
      );
      const overdueTasks = overdueAssignments.length;
      console.log(`\n⏰ Overdue assignments: ${overdueTasks}`);
      
      // ✅ Upcoming assignments (due today or future)
      const upcomingAssignments = typedAssignments.filter(
        assignment => new Date(assignment.dueDate) >= todayStartUTC
      );
      console.log(`📅 Upcoming assignments: ${upcomingAssignments.length}`);

      const completedTasks = await prisma.assignment.count({
        where: {
          userId: userId,
          completed: true,
          taskId: { not: null }
        }
      });

      const totalTasks = await prisma.assignment.count({
        where: { 
          userId: userId,
          taskId: { not: null }
        }
      });

      const swapRequests = await prisma.swapRequest.count({
        where: {
          assignment: {
            userId: userId,
            taskId: { not: null }
          },
          status: "PENDING"
        }
      });

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

      const pointsThisWeek = await this.getWeeklyPoints(userId, todayStartUTC);

      // ✅ Build current week tasks with ALL fields (no filtering)
      const currentWeekTasksFormatted = upcomingAssignments
        .filter(assignment => assignment.task !== null)
        .map(assignment => {
          const dueDate = new Date(assignment.dueDate);
          const timeSlot = assignment.timeSlot;
          const isMultiSlot = assignment.task?.executionFrequency === 'DAILY' && 
                              assignment.task?.points !== assignment.points;
          
          let completedSlotIds: string[] = [];
          let missedSlotIds: string[] = [];
          
          const rawCompleted = assignment.completedTimeSlotIds;
          const rawMissed = assignment.missedTimeSlotIds;
          
          if (rawCompleted) {
            if (typeof rawCompleted === 'string') {
              try { completedSlotIds = JSON.parse(rawCompleted); } catch(e) { completedSlotIds = []; }
            } else if (Array.isArray(rawCompleted)) {
              completedSlotIds = rawCompleted;
            }
          }
          
          if (rawMissed) {
            if (typeof rawMissed === 'string') {
              try { missedSlotIds = JSON.parse(rawMissed); } catch(e) { missedSlotIds = []; }
            } else if (Array.isArray(rawMissed)) {
              missedSlotIds = rawMissed;
            }
          }
          
          const timeSlots = assignment.task?.timeSlots || [];
          
          return {
            id: assignment.id,
            taskId: assignment.task!.id,
            title: assignment.task!.title,
            points: assignment.points,
            dueDate: assignment.dueDate,
            completed: assignment.completed,
            verified: assignment.verified,
            photoUrl: assignment.photoUrl,
            expired: assignment.expired,
            partiallyExpired: assignment.partiallyExpired,
            groupName: assignment.task!.group?.name || 'Unknown Group',
            groupId: assignment.task!.group?.id,
            isOverdue: false,
            daysLeft: Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
            timeSlot: timeSlot ? {
              id: timeSlot.id,
              startTime: timeSlot.startTime,
              endTime: timeSlot.endTime,
              label: timeSlot.label,
              points: timeSlot.points
            } : null,
            isMultiSlot,
            totalPointsPossible: assignment.task!.points,
            completedTimeSlotIds: completedSlotIds,
            missedTimeSlotIds: missedSlotIds,
            timeSlots: timeSlots.map((slot: any) => ({
              id: slot.id,
              startTime: slot.startTime,
              endTime: slot.endTime,
              label: slot.label,
              points: slot.points
            }))
          };
        });

      const overdueTasksFormatted = overdueAssignments
        .filter(assignment => assignment.task !== null)
        .map(assignment => {
          const dueDate = new Date(assignment.dueDate);
          const timeSlot = assignment.timeSlot;
          
          let completedSlotIds: string[] = [];
          let missedSlotIds: string[] = [];
          
          const rawCompleted = assignment.completedTimeSlotIds;
          const rawMissed = assignment.missedTimeSlotIds;
          
          if (rawCompleted) {
            if (typeof rawCompleted === 'string') {
              try { completedSlotIds = JSON.parse(rawCompleted); } catch(e) { completedSlotIds = []; }
            } else if (Array.isArray(rawCompleted)) {
              completedSlotIds = rawCompleted;
            }
          }
          
          if (rawMissed) {
            if (typeof rawMissed === 'string') {
              try { missedSlotIds = JSON.parse(rawMissed); } catch(e) { missedSlotIds = []; }
            } else if (Array.isArray(rawMissed)) {
              missedSlotIds = rawMissed;
            }
          }
          
          return {
            id: assignment.id,
            taskId: assignment.task!.id,
            title: assignment.task!.title,
            points: assignment.points,
            dueDate: assignment.dueDate,
            completed: assignment.completed,
            verified: assignment.verified,
            photoUrl: assignment.photoUrl,
            expired: assignment.expired,
            partiallyExpired: assignment.partiallyExpired,
            groupName: assignment.task!.group?.name || 'Unknown Group',
            groupId: assignment.task!.group?.id,
            isOverdue: true,
            daysOverdue: Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)),
            timeSlot: timeSlot ? {
              id: timeSlot.id,
              startTime: timeSlot.startTime,
              endTime: timeSlot.endTime,
              label: timeSlot.label,
              points: timeSlot.points
            } : null,
            completedTimeSlotIds: completedSlotIds,
            missedTimeSlotIds: missedSlotIds,
            timeSlots: []
          };
        });

      const groups = await Promise.all(userMemberships.map(async (member) => {
        const group = member.group;
        const tasksForThisGroup = currentWeekTasksFormatted.filter(
          (assignment: any) => assignment.groupId === group.id
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

      console.log(`\n🏁 FINAL SUMMARY:`);
      console.log(`   TOTAL assignments in next 7 days: ${tasksDueInNext7Days}`);
      console.log(`   CurrentWeekTasks count: ${currentWeekTasksFormatted.length}`);
      console.log(`   OverdueTasks count: ${overdueTasksFormatted.length}`);
      console.log(`   Stat tasksDueThisWeek: ${tasksDueInNext7Days}`);
      console.log(`   Stat overdueTasks: ${overdueTasks}`);
      console.log(`   Stat completedTasks: ${completedTasks}`);
      console.log(`   Stat totalTasks: ${totalTasks}`);
      console.log(`🔵🔵🔵 [getHomeData] END 🔵🔵🔵\n`);

      return {
        success: true,
        data: {
          user: {
            ...user,
            groupsCount,
            pointsThisWeek,
            totalPoints: await this.getTotalPoints(userId),
            inRotation: userInRotation,
            isAdmin: userIsAdmin,
            groupsWhereUserInRotation,
            groupsWhereUserIsAdmin
          },
          stats: {
            groupsCount,
            tasksDueThisWeek: tasksDueInNext7Days,
            overdueTasks,
            completedTasks,
            totalTasks,
            swapRequests,
            completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
            pointsThisWeek,
            userInRotation,
            isAdmin: userIsAdmin
          },
          currentWeekTasks: currentWeekTasksFormatted,
          overdueTasks: overdueTasksFormatted,
          groups: groups,
          recentActivity: recentActivity.map(activity => ({
            ...activity,
            icon: this.getActivityIcon(activity.type),
            timeAgo: this.getTimeAgo(activity.createdAt)
          })),
          rotationInfo: {
            currentWeekStart: todayStartUTC,
            currentWeekEnd: next7DaysEnd,
            nextRotationStarts: new Date(next7DaysEnd.getTime() + 1000),
            daysUntilNextRotation: Math.max(0, Math.ceil((next7DaysEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          }
        }
      };

    } catch (e: any) {
      console.error("❌ HomeServices error:", e);
      return {
        success: false,
        message: e.message || "Internal server error"
      };
    }
  }
    
  static async getWeeklySummary(userId: string) {
    // ... keep existing code (same as before)
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

      const todayStartUTC = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
      ));

      const next7DaysEnd = new Date(todayStartUTC);
      next7DaysEnd.setUTCDate(todayStartUTC.getUTCDate() + 7);
      next7DaysEnd.setUTCHours(23, 59, 59, 999);

      const completedThisWeek = inRotation ? await prisma.assignment.findMany({
        where: {
          userId: userId,
          completed: true,
          verified: true,
          completedAt: {
            gte: todayStartUTC
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

      const pendingThisWeekRaw = inRotation ? await prisma.assignment.findMany({
        where: {
          userId: userId,
          completed: false,
          expired: false,
          dueDate: {
            gte: todayStartUTC,
            lte: next7DaysEnd
          }
        },
        include: {
          task: {
            select: {
              title: true,
              points: true,
              executionFrequency: true
            }
          },
          timeSlot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              label: true,
              points: true
            }
          }
        }
      }) : [];

      const pendingThisWeek = pendingThisWeekRaw as any[];

      const totalPoints = completedThisWeek.reduce((sum, assignment) => {
        return sum + (assignment.points || 0);
      }, 0);

      const byDay: Record<string, any> = {};
      completedThisWeek.forEach(assignment => {
        if (assignment.completedAt) {
          const day = assignment.completedAt.toLocaleDateString('en-US', { 
            weekday: 'short', 
            timeZone: 'UTC' 
          });
          if (!byDay[day]) {
            byDay[day] = { count: 0, points: 0 };
          }
          byDay[day].count++;
          byDay[day].points += (assignment.points || 0);
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
              points: item.points || 0,
              group: item.task!.group?.name || 'Unknown Group',
              completedAt: item.completedAt,
              verified: item.verified
            })),
          pendingTasksList: pendingThisWeek
            .filter(item => item.task !== null)
            .map(item => ({
              title: item.task!.title,
              points: item.points || 0,
              dueDate: item.dueDate,
              timeSlot: item.timeSlot ? {
                startTime: item.timeSlot.startTime,
                endTime: item.timeSlot.endTime,
                label: item.timeSlot.label
              } : null
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
        }
      });

      return completedAssignments.reduce((sum, assignment) => {
        return sum + (assignment.points || 0);
      }, 0);
    } catch (error) {
      console.error("Error calculating weekly points:", error);
      return 0;
    }
  }

  private static async getTotalPoints(userId: string): Promise<number> {
    try {
      const completedAssignments = await prisma.assignment.findMany({
        where: {
          userId: userId,
          completed: true,
          verified: true
        }
      });

      return completedAssignments.reduce((sum, a) => {
        return sum + (a.points || 0);
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
      'SUBMISSION_PENDING': 'clock',
      'TASK_ASSIGNED': 'clipboard-check',
      'TASK_COMPLETED': 'check',
      'TASK_MISSED': 'alert',
      'SLOT_MISSED': 'alert',
      'SWAP_REQUEST': 'swap-horizontal',
      'SWAP_ACCEPTED': 'handshake',
      'SWAP_EXPIRED': 'clock',
      'POINTS_EARNED': 'star',
      'GROUP_INVITE': 'account-plus',
      'NEW_MEMBER': 'account-plus',
      'FEEDBACK_RESPONSE': 'message-reply',
      'NEGLECT_DETECTED': 'alert-circle'
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