import prisma from "../prisma";

export class GroupActivityService {
  
  // ========== GET GROUP ACTIVITY SUMMARY (For Admins) ==========
  static async getGroupActivitySummary(groupId: string, userId: string) {
  try {
    // Check if user is admin
    const membership = await prisma.groupMember.findFirst({
      where: { userId, groupId, groupRole: "ADMIN" }
    });

    if (!membership) {
      return { success: false, message: "Only admins can view group activity summary" };
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { currentRotationWeek: true }
    });

    // Get overall statistics
    const totalMembers = await prisma.groupMember.count({
      where: { groupId, isActive: true }
    });

    const totalTasks = await prisma.task.count({
      where: { groupId }
    });

    // Current week stats
    const currentWeekAssignments = await prisma.assignment.findMany({
      where: {
        task: { groupId },
        rotationWeek: group?.currentRotationWeek || 1
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        task: { select: { title: true, points: true } },
        timeSlot: true
      }
    });

    const totalAssignments = currentWeekAssignments.length;
    const completedAssignments = currentWeekAssignments.filter(a => a.completed).length;
    const verifiedAssignments = currentWeekAssignments.filter(a => a.verified === true).length;
    const pendingVerification = currentWeekAssignments.filter(a => a.completed && a.verified === null).length;
    const rejectedAssignments = currentWeekAssignments.filter(a => a.verified === false).length;
    const neglectedAssignments = currentWeekAssignments.filter(a => 
      !a.completed && new Date(a.dueDate) < new Date()
    ).length;

    const totalPoints = currentWeekAssignments.reduce((sum, a) => sum + a.points, 0);
    const earnedPoints = currentWeekAssignments
      .filter(a => a.completed)
      .reduce((sum, a) => sum + a.points, 0);

    // ===== REPLACE THIS SECTION =====
    // Get member contributions this week - using Prisma aggregations
    const activeMembers = await prisma.groupMember.findMany({
      where: {
        groupId,
        isActive: true
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            assignments: {
              where: {
                rotationWeek: group?.currentRotationWeek || 1,
                task: { groupId }
              },
              select: {
                id: true,
                completed: true,
                verified: true,
                points: true
              }
            }
          }
        }
      }
    });

    // Transform the data
    const memberContributions = activeMembers.map(item => {
      const assignments = item.user.assignments;
      const totalAssignments = assignments.length;
      const completedAssignments = assignments.filter(a => a.completed).length;
      const verifiedAssignments = assignments.filter(a => a.verified === true).length;
      const earnedPoints = assignments
        .filter(a => a.completed)
        .reduce((sum, a) => sum + a.points, 0);

      return {
        id: item.user.id,
        fullName: item.user.fullName,
        avatarUrl: item.user.avatarUrl,
        totalAssignments,
        completedAssignments,
        verifiedAssignments,
        earnedPoints
      };
    });

    // Sort by earnedPoints descending
    memberContributions.sort((a, b) => b.earnedPoints - a.earnedPoints);
    // ===== END OF REPLACEMENT =====

    return {
      success: true,
      message: "Group activity summary retrieved",
      data: {
        summary: {
          totalMembers,
          totalTasks,
          currentWeek: group?.currentRotationWeek || 1,
          assignments: {
            total: totalAssignments,
            completed: completedAssignments,
            pendingVerification,
            verified: verifiedAssignments,
            rejected: rejectedAssignments,
            neglected: neglectedAssignments
          },
          points: {
            total: totalPoints,
            earned: earnedPoints,
            completionRate: totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0
          }
        },
        memberContributions
      }
    };

  } catch (error: any) {
    console.error("GroupActivityService.getGroupActivitySummary error:", error);
    return { success: false, message: error.message || "Error retrieving activity summary" };
  }
}

  // ========== GET COMPLETION HISTORY (All members) ==========
  static async getCompletionHistory(
    groupId: string, 
    userId: string,
    filters?: {
      week?: number;
      memberId?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    try {
      // Check if user is a member
      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId }
      });

      if (!membership) {
        return { success: false, message: "You are not a member of this group" };
      }

      const where: any = {
        task: { groupId },
        completed: true
      };

      if (filters?.week) {
        where.rotationWeek = filters.week;
      }

      if (filters?.memberId) {
        where.userId = filters.memberId;
      }

      const [history, total] = await Promise.all([
        prisma.assignment.findMany({
          where,
          include: {
            user: { 
              select: { 
                id: true, 
                fullName: true, 
                avatarUrl: true 
              } 
            },
            task: { 
              select: { 
                id: true, 
                title: true, 
                points: true,
                executionFrequency: true 
              } 
            },
            timeSlot: true
          },
          orderBy: { completedAt: 'desc' },
          take: filters?.limit || 50,
          skip: filters?.offset || 0
        }),
        prisma.assignment.count({ where })
      ]);

      const formattedHistory = history.map(item => ({
        id: item.id,
        taskId: item.taskId,
        taskTitle: item.task.title,
        user: item.user,
        points: item.points,
        completedAt: item.completedAt,
        dueDate: item.dueDate,
        isLate: item.completedAt && item.completedAt > item.dueDate,
        verified: item.verified,
        adminNotes: item.adminNotes,
        timeSlot: item.timeSlot ? `${item.timeSlot.startTime} - ${item.timeSlot.endTime}` : null,
        week: item.rotationWeek
      }));

      return {
        success: true,
        message: "Completion history retrieved",
        data: {
          history: formattedHistory,
          total,
          currentWeek: filters?.week || null,
          memberId: filters?.memberId || null
        }
      };

    } catch (error: any) {
      console.error("GroupActivityService.getCompletionHistory error:", error);
      return { success: false, message: error.message || "Error retrieving completion history" };
    }
  }

  // ========== GET MEMBER CONTRIBUTION DETAILS ==========
  static async getMemberContributionDetails(
    groupId: string,
    memberId: string,
    requestingUserId: string
  ) {
    try {
      // Check if requester is admin or the member themselves
      const membership = await prisma.groupMember.findFirst({
        where: { 
          userId: requestingUserId, 
          groupId,
          OR: [
            { groupRole: "ADMIN" },
            { userId: memberId }
          ]
        }
      });

      if (!membership) {
        return { success: false, message: "You don't have permission to view these details" };
      }

      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { currentRotationWeek: true }
      });

      // Get all assignments for this member across all weeks
      const assignments = await prisma.assignment.findMany({
        where: {
          userId: memberId,
          task: { groupId }
        },
        include: {
          task: { 
            select: { 
              id: true, 
              title: true, 
              points: true,
              executionFrequency: true 
            } 
          },
          timeSlot: true
        },
        orderBy: [{ rotationWeek: 'desc' }, { dueDate: 'asc' }]
      });

      // Group by week
      const weeks: Record<number, any> = {};
      
      assignments.forEach(assignment => {
        if (!weeks[assignment.rotationWeek]) {
          weeks[assignment.rotationWeek] = {
            week: assignment.rotationWeek,
            totalAssignments: 0,
            completedAssignments: 0,
            totalPoints: 0,
            earnedPoints: 0,
            assignments: []
          };
        }

        weeks[assignment.rotationWeek].totalAssignments++;
        weeks[assignment.rotationWeek].totalPoints += assignment.points;

        if (assignment.completed) {
          weeks[assignment.rotationWeek].completedAssignments++;
          weeks[assignment.rotationWeek].earnedPoints += assignment.points;
        }

        weeks[assignment.rotationWeek].assignments.push({
          id: assignment.id,
          taskTitle: assignment.task.title,
          dueDate: assignment.dueDate,
          completed: assignment.completed,
          completedAt: assignment.completedAt,
          verified: assignment.verified,
          points: assignment.points,
          isLate: assignment.completedAt && assignment.completedAt > assignment.dueDate,
          timeSlot: assignment.timeSlot ? 
            `${assignment.timeSlot.startTime} - ${assignment.timeSlot.endTime}` : null
        });
      });

      const weeksArray = Object.values(weeks).sort((a: any, b: any) => b.week - a.week);

      // Calculate totals
      const totalAssignments = assignments.length;
      const completedAssignments = assignments.filter(a => a.completed).length;
      const totalPoints = assignments.reduce((sum, a) => sum + a.points, 0);
      const earnedPoints = assignments
        .filter(a => a.completed)
        .reduce((sum, a) => sum + a.points, 0);

      return {
        success: true,
        message: "Member contribution details retrieved",
        data: {
          memberId,
          summary: {
            totalAssignments,
            completedAssignments,
            completionRate: totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0,
            totalPoints,
            earnedPoints,
            currentWeek: group?.currentRotationWeek || 1
          },
          weeks: weeksArray
        }
      };

    } catch (error: any) {
      console.error("GroupActivityService.getMemberContributionDetails error:", error);
      return { success: false, message: error.message || "Error retrieving member details" };
    }
  }

  // ========== GET TASK COMPLETION HISTORY ==========
  static async getTaskCompletionHistory(
    groupId: string,
    userId: string,
    filters?: {
      taskId?: string;
      week?: number;
    }
  ) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId }
      });

      if (!membership) {
        return { success: false, message: "You are not a member of this group" };
      }

      const where: any = {
        task: { groupId },
        completed: true
      };

      if (filters?.taskId) {
        where.taskId = filters.taskId;
      }

      if (filters?.week) {
        where.rotationWeek = filters.week;
      }

      const history = await prisma.assignment.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          task: { select: { id: true, title: true } }
        },
        orderBy: [{ rotationWeek: 'desc' }, { completedAt: 'desc' }],
        take: 100
      });

      // Group by task
      const taskGroups: Record<string, any> = {};

      history.forEach(item => {
        if (!taskGroups[item.taskId]) {
          taskGroups[item.taskId] = {
            taskId: item.taskId,
            taskTitle: item.task.title,
            completions: []
          };
        }

        taskGroups[item.taskId].completions.push({
          userId: item.userId,
          userName: item.user.fullName,
          userAvatar: item.user.avatarUrl,
          completedAt: item.completedAt,
          week: item.rotationWeek,
          points: item.points,
          verified: item.verified
        });
      });

      return {
        success: true,
        message: "Task completion history retrieved",
        data: {
          tasks: Object.values(taskGroups),
          totalCompletions: history.length
        }
      };

    } catch (error: any) {
      console.error("GroupActivityService.getTaskCompletionHistory error:", error);
      return { success: false, message: error.message || "Error retrieving task history" };
    }
  }
}