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

// services/group.activity.services.ts - FIXED getTaskCompletionHistory

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

      // ✅ ADD assignmentId to the completion object
      taskGroups[taskId].completions.push({
        assignmentId: item.id,        // ✅ This is the key fix
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
 // ===== NEW: Get admin dashboard data (WITH NEGLECTED COUNTS) =====
static async getAdminDashboard(groupId: string, userId: string) {
  try {
    // Check if user is admin
    const membership = await prisma.groupMember.findFirst({
      where: { userId, groupId, groupRole: "ADMIN" }
    });

    if (!membership) {
      return { success: false, message: "Only admins can access admin dashboard" };
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { 
        name: true,
        currentRotationWeek: true,
        createdAt: true,
        maxMembers: true
      }
    });

    // Get member stats
    const members = await prisma.groupMember.findMany({
      where: { groupId, isActive: true },
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

    const admins = members.filter(m => m.groupRole === "ADMIN");
    const membersInRotation = members.filter(m => m.inRotation);

    // Get task stats
    const tasks = await prisma.task.findMany({
      where: { groupId, isDeleted: false },
      include: {
        _count: {
          select: { assignments: true }
        }
      }
    });

    // Get current week assignments
    const currentWeekAssignments = await prisma.assignment.findMany({
      where: {
        task: { groupId },
        rotationWeek: group?.currentRotationWeek || 1
      },
      include: {
        user: true,
        task: true
      }
    });

    const completedThisWeek = currentWeekAssignments.filter(a => a.completed).length;
    const totalThisWeek = currentWeekAssignments.length;
    
    // ===== ADD THIS: Calculate neglected tasks =====
    const now = new Date();
    const neglectedAssignments = currentWeekAssignments.filter(a => 
      !a.completed && new Date(a.dueDate) < now
    );
    
    const neglectedCount = neglectedAssignments.length;
    const neglectedPoints = neglectedAssignments.reduce((sum, a) => sum + (a.points || 0), 0);

    // Calculate neglected tasks by member
    const neglectedByMember: Record<string, { count: number; points: number; name: string }> = {};
    neglectedAssignments.forEach(assignment => {
      const userId = assignment.userId;
      const userName = assignment.user?.fullName || 'Unknown';
      
      if (!neglectedByMember[userId]) {
        neglectedByMember[userId] = { count: 0, points: 0, name: userName };
      }
      neglectedByMember[userId].count++;
      neglectedByMember[userId].points += assignment.points || 0;
    });

    return {
      success: true,
      message: "Admin dashboard data retrieved",
      data: {
        group: {
          name: group?.name,
          currentWeek: group?.currentRotationWeek || 1,
          createdAt: group?.createdAt,
          maxMembers: group?.maxMembers || 6,
          memberCount: members.length,
          slotsAvailable: Math.max(0, (group?.maxMembers || 6) - members.length)
        },
        stats: {
          totalMembers: members.length,
          admins: admins.length,
          membersInRotation: membersInRotation.length,
          totalTasks: tasks.length,
          recurringTasks: tasks.filter(t => t.isRecurring).length,
          weeklyCompletion: {
            total: totalThisWeek,
            completed: completedThisWeek,
            percentage: totalThisWeek > 0 ? (completedThisWeek / totalThisWeek) * 100 : 0
          },
          // ===== ADD THIS =====
          neglected: {
            count: neglectedCount,
            points: neglectedPoints,
            byMember: neglectedByMember
          }
        },
        members: members.map(m => ({
          id: m.userId,
          fullName: m.user.fullName,
          avatarUrl: m.user.avatarUrl,
          role: m.groupRole,
          inRotation: m.inRotation,
          isActive: m.isActive,
          points: m.cumulativePoints,
          neglectedCount: neglectedByMember[m.userId]?.count || 0,
          neglectedPoints: neglectedByMember[m.userId]?.points || 0
        }))
      }
    };

  } catch (error: any) {
    console.error("Error in getAdminDashboard:", error);
    return { success: false, message: error.message };
  }
}

// ===== FIXED: Get member dashboard data (WITH NEGLECTED COUNTS) =====
static async getMemberDashboard(groupId: string, userId: string) {
  try {
    // Check if user is member
    const membership = await prisma.groupMember.findFirst({
      where: { userId, groupId }
    });

    if (!membership) {
      return { success: false, message: "You are not a member of this group" };
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { 
        name: true,
        currentRotationWeek: true,
        maxMembers: true
      }
    });

    // Get total members count for the group
    const totalMembers = await prisma.groupMember.count({
      where: { groupId, isActive: true }
    });

    // Get user's assignments
    const assignments = await prisma.assignment.findMany({
      where: {
        userId,
        task: { groupId }
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            points: true,
            timeSlots: true
          }
        },
        timeSlot: true
      },
      orderBy: { dueDate: 'asc' }
    });

    // Get historical assignments (deleted tasks)
    const historicalAssignments = await prisma.assignment.findMany({
      where: {
        userId,
        taskId: null,
        taskTitle: { not: null }
      },
      include: {
        timeSlot: true
      }
    });

    // Separate assignments with and without tasks
    const assignmentsWithTasks = assignments.filter(a => a.task !== null);
    const assignmentsWithoutTasks = assignments.filter(a => a.task === null);

    // Combine all assignments for stats
    const allAssignments = [...assignmentsWithTasks, ...assignmentsWithoutTasks, ...historicalAssignments];

    // Calculate stats
    const now = new Date();
    const pending = allAssignments.filter(a => !a.completed);
    const completed = allAssignments.filter(a => a.completed);
    
    // Calculate personal neglected tasks
    const myNeglected = pending.filter(a => new Date(a.dueDate) < now);
    const myNeglectedCount = myNeglected.length;
    const myNeglectedPoints = myNeglected.reduce((sum, a) => {
      // Safe points calculation for neglected tasks
      const assignment = a as any;
      const points = assignment.task?.points || assignment.taskPoints || assignment.points || 0;
      return sum + points;
    }, 0);

    // Due today - only from assignments with tasks
    const dueToday = assignmentsWithTasks.filter(a => {
      if (a.completed) return false;
      const today = new Date().toDateString();
      const dueDate = new Date(a.dueDate).toDateString();
      return today === dueDate;
    });

    // Calculate points safely
    const pointsThisWeek = completed
      .filter(a => {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return a.completedAt && a.completedAt > weekAgo;
      })
      .reduce((sum, a) => {
        const assignment = a as any;
        const points = assignment.task?.points || assignment.taskPoints || assignment.points || 0;
        return sum + points;
      }, 0);

    const totalPoints = completed.reduce((sum, a) => {
      const assignment = a as any;
      const points = assignment.task?.points || assignment.taskPoints || assignment.points || 0;
      return sum + points;
    }, 0);

    // Get pending swap requests
    const pendingSwaps = await prisma.swapRequest.count({
      where: {
        OR: [
          { 
            assignment: { userId },
            status: "PENDING"
          },
          {
            targetUserId: userId,
            status: "PENDING"
          }
        ]
      }
    });

    // Format due today tasks
    const formattedDueToday = dueToday.map(t => ({
      id: t.id,
      taskId: t.taskId,
      title: t.task!.title,
      points: t.task!.points || t.points,
      dueDate: t.dueDate,
      timeSlot: t.timeSlot ? {
        id: t.timeSlot.id,
        startTime: t.timeSlot.startTime,
        endTime: t.timeSlot.endTime,
        label: t.timeSlot.label
      } : null,
      completed: t.completed
    }));

    // Format upcoming tasks (only from assignments with tasks)
    const upcomingFromTasks = assignmentsWithTasks
      .filter(t => !t.completed)
      .filter(t => !dueToday.some(d => d.id === t.id))
      .slice(0, 5)
      .map(t => ({
        id: t.id,
        taskId: t.taskId,
        title: t.task!.title,
        points: t.task!.points || t.points,
        dueDate: t.dueDate,
        timeSlot: t.timeSlot ? {
          id: t.timeSlot.id,
          startTime: t.timeSlot.startTime,
          endTime: t.timeSlot.endTime,
          label: t.timeSlot.label
        } : null,
        isOverdue: new Date(t.dueDate) < now
      }));

    // Format neglected tasks - FIXED with proper null checks
    const formattedNeglected = myNeglected
      .map(t => {
        const assignment = t as any;
        const taskTitle = assignment.task?.title || assignment.taskTitle || 'Task';
        const taskPoints = assignment.task?.points || assignment.taskPoints || assignment.points || 0;
        const dueDate = new Date(assignment.dueDate);
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          id: assignment.id,
          taskId: assignment.taskId,
          title: taskTitle,
          points: taskPoints,
          dueDate: assignment.dueDate,
          daysOverdue,
          timeSlot: assignment.timeSlot ? {
            id: assignment.timeSlot.id,
            startTime: assignment.timeSlot.startTime,
            endTime: assignment.timeSlot.endTime,
            label: assignment.timeSlot.label
          } : null
        };
      })
      .slice(0, 3);

    // Format historical tasks
    const formattedHistorical = historicalAssignments
      .slice(0, 3)
      .map(t => ({
        id: t.id,
        taskId: null,
        title: t.taskTitle || "Deleted Task",
        points: t.taskPoints || t.points,
        dueDate: t.dueDate,
        completed: t.completed,
        completedAt: t.completedAt,
        isHistorical: true,
        timeSlot: t.timeSlot ? {
          id: t.timeSlot.id,
          startTime: t.timeSlot.startTime,
          endTime: t.timeSlot.endTime,
          label: t.timeSlot.label
        } : null
      }));

    return {
      success: true,
      message: "Member dashboard data retrieved",
      data: {
        group: {
          name: group?.name,
          currentWeek: group?.currentRotationWeek || 1,
          maxMembers: group?.maxMembers || 6,
          memberCount: totalMembers
        },
        stats: {
          pendingTasks: pending.length,
          completedTasks: completed.length,
          dueToday: dueToday.length,
          pendingSwaps,
          pointsThisWeek,
          totalPoints,
          totalAssignments: allAssignments.length,
          historicalCount: historicalAssignments.length,
          myNeglectedCount,
          myNeglectedPoints
        },
        tasks: {
          dueToday: formattedDueToday,
          upcoming: upcomingFromTasks,
          neglected: formattedNeglected,
          recentHistory: formattedHistorical
        },
        user: {
          inRotation: membership.inRotation,
          role: membership.groupRole
        }
      }
    };

  } catch (error: any) {
    console.error("Error in getMemberDashboard:", error);
    return { success: false, message: error.message };
  }
}


// ===== NEW: Get recent activity (FIXED with null checks) =====
static async getRecentActivity(groupId: string, userId: string, limit: number = 10) {
  try {
    // Check if user is member
    const membership = await prisma.groupMember.findFirst({
      where: { userId, groupId }
    });

    if (!membership) {
      return { success: false, message: "You are not a member of this group" };
    }

    // Get recent assignments
    const assignments = await prisma.assignment.findMany({
      where: {
        task: { groupId }
      },
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
            title: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });

    // Format activity - FIXED with null checks
    const activity = assignments
      .filter(a => a.task !== null) // Filter out assignments with null tasks
      .map(a => {
        const task = a.task!; // Safe after filtering
        let type = 'TASK_UPDATED';
        let description = '';

        if (a.completed && a.verified) {
          type = 'TASK_VERIFIED';
          description = `${a.user?.fullName || 'A member'} completed "${task.title}"`;
        } else if (a.completed) {
          type = 'TASK_COMPLETED';
          description = `${a.user?.fullName || 'A member'} submitted "${task.title}"`;
        } else {
          description = `${a.user?.fullName || 'A member'} has "${task.title}" due`;
        }

        return {
          id: a.id,
          type,
          description,
          userId: a.userId,
          userName: a.user?.fullName || 'Unknown',
          userAvatar: a.user?.avatarUrl,
          taskId: task.id,
          taskTitle: task.title,
          createdAt: a.updatedAt
        };
      });

    return {
      success: true,
      message: "Recent activity retrieved",
      data: activity
    };

  } catch (error: any) {
    console.error("Error in getRecentActivity:", error);
    return { success: false, message: error.message };
  }
}
}