// services/group.activity.services.ts - COMPLETE FIXED VERSION
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

    // ===== UPDATED: Get member counts with rotation status =====
    const totalMembers = await prisma.groupMember.count({
      where: { groupId, isActive: true }
    });

    const adminCount = await prisma.groupMember.count({
      where: { 
        groupId, 
        isActive: true,
        groupRole: "ADMIN"
      }
    });

    const membersInRotation = await prisma.groupMember.count({
      where: { 
        groupId, 
        isActive: true,
        inRotation: true
      }
    });

    const membersNotInRotation = await prisma.groupMember.count({
      where: { 
        groupId, 
        isActive: true,
        inRotation: false
      }
    });

    const totalTasks = await prisma.task.count({
      where: { groupId }
    });

    // ===== UPDATED: Get members in rotation for assignment filtering =====
    const memberIdsInRotation = await prisma.groupMember.findMany({
      where: { 
        groupId, 
        isActive: true,
        inRotation: true 
      },
      select: { userId: true }
    }).then(members => members.map(m => m.userId));

    // Current week stats - ONLY for members in rotation
    const currentWeekAssignments = await prisma.assignment.findMany({
      where: {
        task: { groupId },
        rotationWeek: group?.currentRotationWeek || 1,
        userId: { in: memberIdsInRotation } // Only show assignments for members in rotation
      },
      include: {
        user: { 
          select: { 
            id: true, 
            fullName: true, 
            avatarUrl: true,
            groups: {
              where: { groupId },
              select: { groupRole: true, inRotation: true }
            }
          } 
        },
        task: { select: { title: true, points: true } },
        timeSlot: true
      }
    });

    // Filter out assignments with null tasks
    const validAssignments = currentWeekAssignments.filter(a => a.task !== null);

    const totalAssignments = validAssignments.length;
    const completedAssignments = validAssignments.filter(a => a.completed).length;
    const verifiedAssignments = validAssignments.filter(a => a.verified === true).length;
    const pendingVerification = validAssignments.filter(a => a.completed && a.verified === null).length;
    const rejectedAssignments = validAssignments.filter(a => a.verified === false).length;
    const neglectedAssignments = validAssignments.filter(a => 
      !a.completed && new Date(a.dueDate) < new Date()
    ).length;

    const totalPoints = validAssignments.reduce((sum, a) => sum + a.points, 0);
    const earnedPoints = validAssignments
      .filter(a => a.completed)
      .reduce((sum, a) => sum + a.points, 0);

    // ===== UPDATED: Get member contributions - ONLY for members in rotation =====
    const activeMembers = await prisma.groupMember.findMany({
      where: {
        groupId,
        isActive: true,
        inRotation: true // Only members in rotation
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
                points: true,
                task: {
                  select: {
                    title: true
                  }
                }
              }
            }
          }
        }
      }
    });

    // Transform the data with null checks
    const memberContributions = activeMembers
      .map(item => {
        // Filter assignments that still have tasks
        const validUserAssignments = item.user.assignments.filter(a => a.task !== null);
        
        const totalAssignments = validUserAssignments.length;
        const completedAssignments = validUserAssignments.filter(a => a.completed).length;
        const verifiedAssignments = validUserAssignments.filter(a => a.verified === true).length;
        const earnedPoints = validUserAssignments
          .filter(a => a.completed)
          .reduce((sum, a) => sum + a.points, 0);

        return {
          id: item.user.id,
          fullName: item.user.fullName,
          avatarUrl: item.user.avatarUrl,
          totalAssignments,
          completedAssignments,
          verifiedAssignments,
          earnedPoints,
          inRotation: true
        };
      })
      // Filter out members with no valid assignments
      .filter(m => m.totalAssignments > 0);

    // Sort by earnedPoints descending
    memberContributions.sort((a, b) => b.earnedPoints - a.earnedPoints);

    // ===== NEW: Get admin info for context =====
    const admins = await prisma.groupMember.findMany({
      where: {
        groupId,
        isActive: true,
        groupRole: "ADMIN"
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true
          }
        }
      }
    });

    const adminList = admins.map(admin => ({
      id: admin.user.id,
      fullName: admin.user.fullName,
      avatarUrl: admin.user.avatarUrl,
      role: admin.groupRole
    }));

    return {
      success: true,
      message: "Group activity summary retrieved",
      data: {
        summary: {
          totalMembers,
          adminCount,
          membersInRotation,
          membersNotInRotation,
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
        memberContributions,
        admins: adminList,
        rotationInfo: {
          hasEnoughMembers: membersInRotation >= Math.ceil(totalTasks / 5), // Rough estimate
          membersNeeded: Math.max(0, Math.ceil(totalTasks / 5) - membersInRotation),
          tasksPerMember: membersInRotation > 0 ? (totalTasks / membersInRotation).toFixed(1) : 0
        }
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

      // Filter out items with null tasks
      const validHistory = history.filter(item => item.task !== null);

      const formattedHistory = validHistory.map(item => ({
        id: item.id,
        taskId: item.taskId,
        taskTitle: item.task!.title,
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
          total: validHistory.length,
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

    // ===== UPDATED: Get member info with rotation status =====
    const targetMember = await prisma.groupMember.findFirst({
      where: { userId: memberId, groupId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true
          }
        }
      }
    });

    if (!targetMember) {
      return { success: false, message: "Member not found" };
    }

    // Check if member is an admin (and therefore not in rotation)
    const isAdmin = targetMember.groupRole === "ADMIN";
    const inRotation = targetMember.inRotation || false;

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

    // Filter out assignments with null tasks
    const validAssignments = assignments.filter(a => a.task !== null);

    // Group by week
    const weeks: Record<number, any> = {};
    
    validAssignments.forEach(assignment => {
      const weekNum = assignment.rotationWeek;
      
      if (!weeks[weekNum]) {
        weeks[weekNum] = {
          week: weekNum,
          totalAssignments: 0,
          completedAssignments: 0,
          totalPoints: 0,
          earnedPoints: 0,
          assignments: []
        };
      }

      weeks[weekNum].totalAssignments++;
      weeks[weekNum].totalPoints += assignment.points;

      if (assignment.completed) {
        weeks[weekNum].completedAssignments++;
        weeks[weekNum].earnedPoints += assignment.points;
      }

      weeks[weekNum].assignments.push({
        id: assignment.id,
        taskTitle: assignment.task!.title,
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
    const totalAssignments = validAssignments.length;
    const completedAssignments = validAssignments.filter(a => a.completed).length;
    const totalPoints = validAssignments.reduce((sum, a) => sum + a.points, 0);
    const earnedPoints = validAssignments
      .filter(a => a.completed)
      .reduce((sum, a) => sum + a.points, 0);

    // ===== NEW: Add role-based response =====
    let roleMessage = "";
    if (isAdmin) {
      roleMessage = "This user is an admin and does not participate in task rotation. They have no assigned tasks.";
    } else if (!inRotation) {
      roleMessage = "This user is not currently in rotation and has no assigned tasks.";
    }

    return {
      success: true,
      message: "Member contribution details retrieved",
      data: {
        member: {
          id: targetMember.user.id,
          fullName: targetMember.user.fullName,
          email: targetMember.user.email,
          avatarUrl: targetMember.user.avatarUrl,
          role: targetMember.groupRole,
          inRotation: targetMember.inRotation,
          isActive: targetMember.isActive,
          joinedAt: targetMember.joinedAt
        },
        summary: {
          totalAssignments,
          completedAssignments,
          completionRate: totalAssignments > 0 ? (completedAssignments / totalAssignments) * 100 : 0,
          totalPoints,
          earnedPoints,
          currentWeek: group?.currentRotationWeek || 1,
          hasNoAssignments: totalAssignments === 0,
          isAdmin: isAdmin,
          inRotation: inRotation
        },
        weeks: weeksArray,
        roleInfo: roleMessage ? { message: roleMessage } : undefined
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

      // Filter out items with null tasks
      const validHistory = history.filter(item => item.task !== null);

      // Group by task
      const taskGroups: Record<string, any> = {};

      validHistory.forEach(item => {
        const taskId = item.taskId;
        if (!taskId) return;
        
        if (!taskGroups[taskId]) {
          taskGroups[taskId] = {
            taskId: item.taskId,
            taskTitle: item.task!.title,
            completions: []
          };
        }

        taskGroups[taskId].completions.push({
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
          totalCompletions: validHistory.length
        }
      };

    } catch (error: any) {
      console.error("GroupActivityService.getTaskCompletionHistory error:", error);
      return { success: false, message: error.message || "Error retrieving task history" };
    }
  }
}