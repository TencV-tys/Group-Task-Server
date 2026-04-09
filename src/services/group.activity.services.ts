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
        userId: { in: memberIdsInRotation }
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

    const totalPoints = validAssignments.reduce((sum, a) => sum + (a.points || 0), 0);
    
    // ✅ FIXED: Only count VERIFIED assignments for earned points
    const earnedPoints = validAssignments
      .filter(a => a.completed && a.verified === true)
      .reduce((sum, a) => sum + (a.points || 0), 0);

    // ===== UPDATED: Get member contributions - ONLY for members in rotation =====
    const activeMembers = await prisma.groupMember.findMany({
      where: {
        groupId,
        isActive: true,
        inRotation: true
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
        
        const totalAssignmentsCount = validUserAssignments.length;
        const completedAssignmentsCount = validUserAssignments.filter(a => a.completed).length;
        const verifiedAssignmentsCount = validUserAssignments.filter(a => a.verified === true).length;
        
        // ✅ FIXED: Only count VERIFIED assignments for earned points
        const earnedPointsTotal = validUserAssignments
          .filter(a => a.completed && a.verified === true)
          .reduce((sum, a) => sum + (a.points || 0), 0);

        return {
          id: item.user.id,
          fullName: item.user.fullName,
          avatarUrl: item.user.avatarUrl,
          totalAssignments: totalAssignmentsCount,
          completedAssignments: completedAssignmentsCount,
          verifiedAssignments: verifiedAssignmentsCount,
          earnedPoints: earnedPointsTotal,
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
          hasEnoughMembers: membersInRotation >= Math.ceil(totalTasks / 5),
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
        points: item.points || 0,
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

 // In group.activity.services.ts - FIXED getMemberContributionDetails

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
            executionFrequency: true,
            timeSlots: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
                label: true,
                points: true
              }
            }
          } 
        },
        timeSlot: true
      },
      orderBy: [{ rotationWeek: 'desc' }, { dueDate: 'asc' }]
    });

    // Filter out assignments with null tasks
    const validAssignments = assignments.filter(a => a.task !== null);
    
    // ✅ DEBUG: Log all assignments to see what's happening
    console.log(`📊 [MemberContributions] Found ${validAssignments.length} assignments for ${targetMember.user.fullName}`);
    validAssignments.forEach(a => {
      console.log(`   Assignment: ${a.task?.title}, completed: ${a.completed}, verified: ${a.verified}, points: ${a.points}, expired: ${a.expired}, week: ${a.rotationWeek}`);
    });

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

      // Get the points for this assignment
      let assignmentPoints = assignment.points || 0;
      
      // For tasks with time slots, use the specific time slot points
      if (assignment.task?.timeSlots && assignment.task.timeSlots.length > 0 && assignment.timeSlot) {
        assignmentPoints = assignment.timeSlot.points || assignment.points || 0;
      }
      
      weeks[weekNum].totalAssignments++;
      weeks[weekNum].totalPoints += assignmentPoints;

      // ✅ Check if completed
      if (assignment.completed === true) {
        weeks[weekNum].completedAssignments++;
        console.log(`   ✅ Completed assignment found: ${assignment.task?.title}, verified: ${assignment.verified}, points: ${assignmentPoints}`);
      }
      
      // ✅ Check if verified (points earned)
      if (assignment.verified === true) {
        weeks[weekNum].earnedPoints += assignmentPoints;
        console.log(`   💰 Verified assignment found: ${assignment.task?.title}, points: ${assignmentPoints}`);
      }

      // Check if missed
      let isMissed = false;
      if (assignment.expired === true) {
        isMissed = true;
      }
      
      const missedSlotIdsRaw = (assignment as any).missedTimeSlotIds;
      if (missedSlotIdsRaw && assignment.timeSlot?.id) {
        let missedSlotIds: string[] = [];
        if (typeof missedSlotIdsRaw === 'string') {
          try {
            missedSlotIds = JSON.parse(missedSlotIdsRaw);
          } catch (e) {
            missedSlotIds = [];
          }
        } else if (Array.isArray(missedSlotIdsRaw)) {
          missedSlotIds = missedSlotIdsRaw;
        }
        
        if (missedSlotIds.includes(assignment.timeSlot.id)) {
          isMissed = true;
        }
      }

      weeks[weekNum].assignments.push({
        id: assignment.id,
        taskTitle: assignment.task!.title,
        dueDate: assignment.dueDate,
        completed: assignment.completed,
        completedAt: assignment.completedAt,
        verified: assignment.verified,
        points: assignmentPoints,
        isLate: assignment.completedAt && assignment.completedAt > assignment.dueDate,
        timeSlot: assignment.timeSlot ? 
          `${assignment.timeSlot.startTime} - ${assignment.timeSlot.endTime}` : null,
        isMissed: isMissed
      });
    });

    const weeksArray = Object.values(weeks).sort((a: any, b: any) => b.week - a.week);

    // Calculate totals from weeks data
    let totalAssignments = 0;
    let completedAssignments = 0;
    let totalPoints = 0;
    let earnedPoints = 0;
    
    weeksArray.forEach((week: any) => {
      totalAssignments += week.totalAssignments;
      completedAssignments += week.completedAssignments;
      totalPoints += week.totalPoints;
      earnedPoints += week.earnedPoints;
    });

    const completionRate = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;

    console.log(`📊 [MemberContributions] FINAL Stats for ${targetMember.user.fullName}:`, {
      totalAssignments,
      completedAssignments,
      totalPoints, 
      earnedPoints,
      completionRate: completionRate.toFixed(1)
    }); 

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
          completionRate: Math.round(completionRate),
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

    // ✅ Include both fully completed AND verified assignments (partial completions)
    const where: any = {
      task: { groupId },
      OR: [
        { completed: true },                    // Fully completed assignments
        { verified: true }                      // Verified slots (even if not fully completed)
      ]
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
        task: { 
          select: { 
            id: true, 
            title: true, 
            timeSlots: {
              select: {
                id: true,
                startTime: true,
                endTime: true,
                label: true,
                points: true
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
      orderBy: [{ rotationWeek: 'desc' }, { completedAt: 'desc' }],
      take: 100
    });

    // Filter out items with null tasks
    const validHistory = history.filter(item => item.task !== null);
    
    console.log(`📊 [TaskCompletionHistory] Found ${validHistory.length} completed/verified assignments`);

    // Group by task
    const taskGroups: Record<string, any> = {};

    validHistory.forEach(item => {
      const taskId = item.taskId;
      if (!taskId) return;
      
      if (!taskGroups[taskId]) {
        const task = item.task!;
        const totalSlots = task.timeSlots?.length || 1;
        
        taskGroups[taskId] = {
          taskId: item.taskId,
          taskTitle: item.task!.title,
          totalSlots,
          completions: []
        };
      }

      // Determine if this is a partial completion
      const isPartial = item.verified === true && !item.completed;
      const slotInfo = item.timeSlot ? {
        startTime: item.timeSlot.startTime,
        endTime: item.timeSlot.endTime,
        label: item.timeSlot.label,
        points: item.timeSlot.points
      } : null;

      taskGroups[taskId].completions.push({
        assignmentId: item.id,
        userId: item.userId,
        userName: item.user.fullName,
        userAvatar: item.user.avatarUrl,
        completedAt: item.completedAt,
        week: item.rotationWeek,
        points: item.points || 0,
        verified: item.verified,
        isPartial,
        timeSlot: slotInfo,
        isDueToday: item.dueDate ? new Date(item.dueDate).toDateString() === new Date().toDateString() : false
      });
    });

    console.log(`📊 [TaskCompletionHistory] Found ${Object.keys(taskGroups).length} task groups with completions`);

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



// In group.activity.services.ts - COMPLETE FIXED getAdminDashboard

// ===== ADMIN DASHBOARD DATA =====
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
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true
          }
        },
        task: {
          include: {
            timeSlots: true
          }
        },
        timeSlot: true
      }
    });

    // Filter out assignments with null tasks
    const validAssignments = currentWeekAssignments.filter(a => a.task !== null);
    const now = new Date();

    // ✅ Calculate stats at ASSIGNMENT level
    const totalAssignments = validAssignments.length;
    const completedAssignments = validAssignments.filter(a => a.completed === true).length;
    const verifiedAssignments = validAssignments.filter(a => a.verified === true).length;
    const pendingAssignments = validAssignments.filter(a => !a.completed && !a.expired).length;
    
    // ✅ Calculate expired assignments correctly
    const expiredAssignmentsList = validAssignments.filter(a => 
      a.expired === true || (!a.completed && new Date(a.dueDate) < now)
    );
    const expiredCount = expiredAssignmentsList.length;
    
    // ✅ Calculate points correctly
const totalPoints = validAssignments.reduce((sum: number, a: any) => sum + (a.points || 0), 0);
const earnedPoints = validAssignments
  .filter(a => a.verified === true)
  .reduce((sum: number, a: any) => sum + (a.points || 0), 0);

// ✅ Calculate completion percentage - ROUND to nearest integer
const completionPercentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
const neglectedPoints = expiredAssignmentsList.reduce((sum: number, a: any) => sum + (a.points || 0), 0);

    // Calculate neglected by member
    const neglectedByMember: Record<string, { count: number; points: number; name: string }> = {};
    expiredAssignmentsList.forEach((assignment: any) => {
      const memberId = assignment.userId;
      const member = members.find(m => m.userId === memberId);
      const memberName = member?.user?.fullName || 'Unknown';
      
      if (!neglectedByMember[memberId]) {
        neglectedByMember[memberId] = { count: 0, points: 0, name: memberName };
      }
      neglectedByMember[memberId].count++;
      neglectedByMember[memberId].points += (assignment.points || 0);
    });

    console.log('📊 [AdminDashboard] Assignment-level Stats:', {
      totalAssignments,
      completedAssignments,
      verifiedAssignments,
      pendingAssignments,
      expiredCount,
      totalPoints,
      earnedPoints,
      completionPercentage: completionPercentage.toFixed(1),
      neglectedPoints
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
            total: totalAssignments,              // 19 total assignments
            completed: verifiedAssignments,       // 1 verified assignment
            pending: pendingAssignments,          // 18 pending assignments
            percentage: completionPercentage,     // 4.5% (5/110)
            activeTotal: totalAssignments - expiredCount  // 18 active
          },
          points: {
            total: totalPoints,                   // 110 total points
            earned: earnedPoints,                 // 5 earned points
            pendingVerification: 0,
            rejected: 0
          },
          neglected: {
            count: expiredCount,
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

// In group.activity.services.ts - REVERT to show TOTAL ASSIGNMENTS count

// ===== MEMBER DASHBOARD DATA =====
static async getMemberDashboard(groupId: string, userId: string) {
  try {
    console.log('🔍🔍🔍 [getMemberDashboard] START 🔍🔍🔍');
    console.log(`📊 Group ID: ${groupId}`);
    console.log(`👤 User ID: ${userId}`);

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

    const totalMembers = await prisma.groupMember.count({
      where: { groupId, isActive: true }
    });

    // Get user's assignments for CURRENT WEEK only
    const assignments = await prisma.assignment.findMany({
      where: {
        userId,
        task: { groupId },
        rotationWeek: group?.currentRotationWeek || 1
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

    const assignmentsWithTasks = assignments.filter(a => a.task !== null);
    const now = new Date();
    const currentWeek = group?.currentRotationWeek || 1;

    // ✅ SHOW TOTAL ASSIGNMENTS COUNT (not grouped by task)
    const totalAssignments = assignmentsWithTasks.length;
    
    // Pending = not completed AND not expired
    const pendingAssignments = assignmentsWithTasks.filter(a => !a.completed && !a.expired);
    const pendingCount = pendingAssignments.length;
    
    // Completed = completed assignments
    const completedAssignments = assignmentsWithTasks.filter(a => a.completed === true);
    const completedCount = completedAssignments.length;
    
    // Expired assignments
    const expiredAssignments = assignmentsWithTasks.filter(a => a.expired === true && !a.completed);
    const myNeglectedCount = expiredAssignments.length;
    const myNeglectedPoints = expiredAssignments.reduce((sum, a) => sum + (a.points || 0), 0);

    console.log(`📊 [getMemberDashboard] Assignment counts (not grouped):`);
    console.log(`   Total assignments: ${totalAssignments}`);
    console.log(`   Pending assignments: ${pendingCount}`);
    console.log(`   Completed assignments: ${completedCount}`);
    console.log(`   Expired assignments: ${myNeglectedCount}`);

    // Due today - assignments due today that are not completed
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const dueTodayAssignments = pendingAssignments.filter(assignment => {
      const dueDate = new Date(assignment.dueDate);
      return dueDate >= startOfDay && dueDate <= endOfDay;
    });
    
    const dueTodayCount = dueTodayAssignments.length;

    // Upcoming assignments - pending but not due today
    const upcomingAssignments = pendingAssignments.filter(assignment => {
      const dueDate = new Date(assignment.dueDate);
      return !(dueDate >= startOfDay && dueDate <= endOfDay);
    });

    console.log(`📅 [getMemberDashboard] Due today: ${dueTodayCount}, Upcoming: ${upcomingAssignments.length}`);

    // Points calculation - only from VERIFIED assignments
    const verifiedCompleted = assignmentsWithTasks.filter(a => a.completed && a.verified === true);
    
    const pointsThisWeek = verifiedCompleted
      .filter(a => {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return a.completedAt && a.completedAt > weekAgo;
      })
      .reduce((sum, a) => sum + (a.points || 0), 0);

    const totalPoints = verifiedCompleted.reduce((sum, a) => sum + (a.points || 0), 0);

    // Pending swaps count
    const pendingSwaps = await prisma.swapRequest.count({
      where: {
        OR: [
          { assignment: { userId }, status: "PENDING" },
          { targetUserId: userId, status: "PENDING" }
        ]
      }
    });

    // Format due today assignments
    const formattedDueToday = dueTodayAssignments.map(a => ({
      id: a.id,
      taskId: a.taskId,
      title: a.task!.title,
      points: a.points || 0,
      dueDate: a.dueDate,
      timeSlot: a.timeSlot,
      completed: a.completed
    }));

    // Format upcoming assignments
    const formattedUpcoming = upcomingAssignments.slice(0, 10).map(a => ({
      id: a.id,
      taskId: a.taskId,
      title: a.task!.title,
      points: a.points || 0,
      dueDate: a.dueDate,
      timeSlot: a.timeSlot,
      isOverdue: new Date(a.dueDate) < now && !a.expired
    }));

    // Format neglected assignments
    const formattedNeglected = expiredAssignments.slice(0, 3).map(a => {
      const dueDate = new Date(a.dueDate);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: a.id,
        taskId: a.taskId,
        title: a.task!.title,
        points: a.points || 0,
        dueDate: a.dueDate,
        expiredAt: a.expiredAt,
        daysOverdue,
        timeSlot: a.timeSlot
      };
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
      },
      orderBy: { dueDate: 'desc' },
      take: 10
    });

    const formattedHistorical = historicalAssignments.slice(0, 3).map(t => ({
      id: t.id,
      taskId: null,
      title: t.taskTitle || "Deleted Task",
      points: t.taskPoints || t.points || 0,
      dueDate: t.dueDate,
      completed: t.completed,
      completedAt: t.completedAt,
      isHistorical: true,
      timeSlot: t.timeSlot
    }));

    console.log(`🏁 [getMemberDashboard] Final stats (SHOWING ASSIGNMENT COUNTS):`, {
      totalAssignments,
      pendingCount,
      completedCount,
      dueTodayCount,
      myNeglectedCount,
      upcomingCount: upcomingAssignments.length
    });

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
          pendingTasks: pendingCount,        // ✅ Now shows TOTAL ASSIGNMENTS (14)
          completedTasks: completedCount,
          dueToday: dueTodayCount,
          pendingSwaps,
          pointsThisWeek,
          totalPoints,
          totalAssignments,                  // Keep for reference
          historicalCount: historicalAssignments.length,
          myNeglectedCount,
          myNeglectedPoints
        },
        tasks: {
          dueToday: formattedDueToday,
          upcoming: formattedUpcoming,
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

// ===== GET RECENT ACTIVITY =====
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

    // Format activity - with null checks
    const activity = assignments
      .filter(a => a.task !== null)
      .map(a => {
        const task = a.task!;
        let type = 'TASK_UPDATED';
        let description = '';

        if (a.completed && a.verified === true) {
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

// Add this to group.activity.services.ts
static async getLeaderboard(groupId: string, userId: string) {
  const membership = await prisma.groupMember.findFirst({
    where: { userId, groupId }
  });
  if (!membership) {
    return { success: false, message: "You are not a member" };
  }
  
  const members = await prisma.groupMember.findMany({
    where: { groupId, isActive: true, inRotation: true, groupRole: { not: "ADMIN" } },
    include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    orderBy: { cumulativePoints: 'desc' }
  });
  
  const leaderboard = members.map((member, index) => ({
    rank: index + 1,
    userId: member.userId,
    fullName: member.user.fullName,
    avatarUrl: member.user.avatarUrl,
    points: member.cumulativePoints || 0,
  })); 
  
  return {
    success: true,
    data: { leaderboard, totalPoints: leaderboard.reduce((sum, m) => sum + m.points, 0) }
  };
}


} 