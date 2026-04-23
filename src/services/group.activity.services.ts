// services/group.activity.services.ts - COMPLETE FIXED VERSION WITH UTC

import prisma from "../prisma";

export class GroupActivityService {

  // In group.activity.services.ts - FULLY UPDATED getGroupActivitySummary

static async getGroupActivitySummary(groupId: string, userId: string) {
  try {
    console.log('\n🔍🔍🔍 [getGroupActivitySummary] START 🔍🔍🔍');
    console.log(`📊 Group ID: ${groupId}`);
    console.log(`👤 User ID: ${userId}`);
    
    const membership = await prisma.groupMember.findFirst({
      where: { userId, groupId, groupRole: "ADMIN" }
    });

    if (!membership) {
      console.log('❌ User is not admin');
      return { success: false, message: "Only admins can view group activity summary" };
    }
    console.log('✅ User is admin');

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { currentRotationWeek: true }
    });
    console.log(`📅 Current rotation week: ${group?.currentRotationWeek || 1}`);

    const totalMembers = await prisma.groupMember.count({
      where: { groupId, isActive: true }
    });
    console.log(`👥 Total active members: ${totalMembers}`);

    const adminCount = await prisma.groupMember.count({
      where: { 
        groupId, 
        isActive: true,
        groupRole: "ADMIN" 
      }
    });
    console.log(`👑 Admin count: ${adminCount}`);

    const membersInRotation = await prisma.groupMember.count({
      where: { 
        groupId, 
        isActive: true,
        inRotation: true
      }
    });
    console.log(`🔄 Members in rotation: ${membersInRotation}`);

    const membersNotInRotation = await prisma.groupMember.count({
      where: { 
        groupId, 
        isActive: true,
        inRotation: false
      }
    });
    console.log(`⏸️ Members not in rotation: ${membersNotInRotation}`);

    const totalTasks = await prisma.task.count({
      where: { groupId }
    });
    console.log(`📋 Total tasks: ${totalTasks}`);

    const memberIdsInRotation = await prisma.groupMember.findMany({
      where: { 
        groupId, 
        isActive: true,
        inRotation: true 
      },
      select: { userId: true }
    }).then(members => members.map(m => m.userId));
    console.log(`👥 Member IDs in rotation: ${memberIdsInRotation.length} members`);

    console.log(`\n📊 Fetching current week assignments for week ${group?.currentRotationWeek || 1}...`);
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
    console.log(`📊 Raw assignments found: ${currentWeekAssignments.length}`);

    const validAssignments = currentWeekAssignments.filter(a => a.task !== null);
    console.log(`✅ Valid assignments (with tasks): ${validAssignments.length}`);

    const now = new Date();
    
    const totalAssignments = validAssignments.length;
    const completedAssignments = validAssignments.filter(a => a.completed === true).length;
    const verifiedAssignments = validAssignments.filter(a => a.verified === true).length;
    
    // ✅ FIXED: Pending verification = has photo AND not verified (works for both single and multi-slot)
    const pendingVerification = validAssignments.filter(a => 
      a.photoUrl !== null && a.verified === null
    ).length;
    
    const rejectedAssignments = validAssignments.filter(a => a.verified === false).length;
    
    // ✅ FIXED: Use UTC for date comparison
    const neglectedAssignments = validAssignments.filter(a => 
      (a.expired === true || (!a.completed && new Date(a.dueDate).getTime() < now.getTime())) &&
      a.verified !== true
    ).length;
    
    const totalPoints = validAssignments.reduce((sum, a) => sum + (a.points || 0), 0);
    const earnedPoints = validAssignments
      .filter(a => a.verified === true)
      .reduce((sum, a) => {
        let pointsToAdd = a.points || 0;
        if (a.timeSlot && a.timeSlot.points) {
          pointsToAdd = a.timeSlot.points;
        }
        return sum + pointsToAdd;
      }, 0);
    
    console.log(`\n📈 Assignment Stats:`);
    console.log(`   Total: ${totalAssignments}`);
    console.log(`   Completed: ${completedAssignments}`);
    console.log(`   Verified: ${verifiedAssignments}`);
    console.log(`   Pending Verification: ${pendingVerification}`);
    console.log(`   Rejected: ${rejectedAssignments}`);
    console.log(`   Neglected: ${neglectedAssignments}`);

    console.log(`\n💰 Points Stats:`);
    console.log(`   Total Points: ${totalPoints}`);
    console.log(`   Earned Points (verified): ${earnedPoints}`);
    console.log(`   Completion Rate: ${totalPoints > 0 ? ((earnedPoints / totalPoints) * 100).toFixed(1) : 0}%`);

    console.log(`\n📊 Fetching member contributions for current week...`);
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
    console.log(`👥 Active members found: ${activeMembers.length}`);

    const memberContributions = activeMembers
      .map(item => {
        const validUserAssignments = item.user.assignments.filter(a => a.task !== null);
        
        const totalAssignmentsCount = validUserAssignments.length;
        const completedAssignmentsCount = validUserAssignments.filter(a => a.completed).length;
        const verifiedAssignmentsCount = validUserAssignments.filter(a => a.verified === true).length;
        
        const earnedPointsTotal = validUserAssignments
          .filter(a => a.verified === true)
          .reduce((sum, a) => sum + (a.points || 0), 0);

        console.log(`   Member: ${item.user.fullName}`);
        console.log(`      Total: ${totalAssignmentsCount}, Completed: ${completedAssignmentsCount}, Verified: ${verifiedAssignmentsCount}, Earned: ${earnedPointsTotal}`);

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
      .filter(m => m.totalAssignments > 0);

    console.log(`\n🏆 Member contributions (after filtering): ${memberContributions.length} members`);
    memberContributions.sort((a, b) => b.earnedPoints - a.earnedPoints);

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

    console.log(`\n✅ [getGroupActivitySummary] COMPLETED`);
    console.log(`   Total earned points from memberContributions: ${memberContributions.reduce((sum, m) => sum + m.earnedPoints, 0)}`);
    console.log(`   Summary points.earned: ${earnedPoints}`);
    console.log(`   Neglected count: ${neglectedAssignments}`);
    console.log(`   Pending verification count: ${pendingVerification}`);
    console.log(`🔍🔍🔍 [getGroupActivitySummary] END 🔍🔍🔍\n`);

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
    console.error("❌ GroupActivityService.getGroupActivitySummary error:", error);
    return { success: false, message: error.message || "Error retrieving activity summary" };
  }
}


  // ========== GET COMPLETION HISTORY ==========
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

  // ========== GET MEMBER CONTRIBUTION DETAILS ==========
  static async getMemberContributionDetails(
    groupId: string,
    memberId: string,
    requestingUserId: string
  ) {
    try {
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

      const validAssignments = assignments.filter(a => a.task !== null);
      
      console.log(`📊 [MemberContributions] Found ${validAssignments.length} assignments for ${targetMember.user.fullName}`);

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

        let assignmentPoints = assignment.points || 0;
        
        if (assignment.task?.timeSlots && assignment.task.timeSlots.length > 0 && assignment.timeSlot) {
          assignmentPoints = assignment.timeSlot.points || assignment.points || 0;
        }
        
        weeks[weekNum].totalAssignments++;
        weeks[weekNum].totalPoints += assignmentPoints;

        if (assignment.completed === true) {
          weeks[weekNum].completedAssignments++;
        }
        
        if (assignment.verified === true) {
          weeks[weekNum].earnedPoints += assignmentPoints;
        }

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
  taskId: assignment.taskId,
  taskTitle: assignment.task!.title,
  dueDate: assignment.dueDate,
  completed: assignment.completed,
  completedAt: assignment.completedAt,
  verified: assignment.verified,
  points: assignmentPoints,
  isLate: assignment.completedAt && assignment.completedAt > assignment.dueDate,
  timeSlot: assignment.timeSlot ? 
    `${assignment.timeSlot.startTime} - ${assignment.timeSlot.endTime}` : null,
  timeSlotId: assignment.timeSlot?.id,
  isMissed: isMissed,
  // ✅ CRITICAL: Include photoUrl for pending review detection
  photoUrl: assignment.photoUrl,
  // ✅ Also include these for better status detection
  expired: assignment.expired,
  completedTimeSlotIds: (assignment as any).completedTimeSlotIds || [],
  missedTimeSlotIds: (assignment as any).missedTimeSlotIds || []
});
 
      }); 

      const weeksArray = Object.values(weeks).sort((a: any, b: any) => b.week - a.week);

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

      const where: any = {
        task: { groupId },
        OR: [
          { completed: true },
          { verified: true }
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

      const validHistory = history.filter(item => item.task !== null);
      const now = new Date();
      
      console.log(`📊 [TaskCompletionHistory] Found ${validHistory.length} completed/verified assignments`);

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

        const isPartial = item.verified === true && !item.completed;
        const slotInfo = item.timeSlot ? {
          startTime: item.timeSlot.startTime,
          endTime: item.timeSlot.endTime,
          label: item.timeSlot.label,
          points: item.timeSlot.points
        } : null;

        // ✅ FIXED: Use UTC for date comparison
        const dueDate = item.dueDate ? new Date(item.dueDate) : null;
        const isDueToday = dueDate ? (
          dueDate.getUTCFullYear() === now.getUTCFullYear() &&
          dueDate.getUTCMonth() === now.getUTCMonth() &&
          dueDate.getUTCDate() === now.getUTCDate()
        ) : false;

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
          isDueToday
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

    const totalAssignments = assignmentsWithTasks.length;
    
    // ✅ Separate counts for different statuses
    const notStartedTasks = assignmentsWithTasks.filter(a => 
      !a.completed && 
      !a.expired && 
      !a.photoUrl && 
      a.verified !== true && 
      a.verified !== false
    );
    const pendingCount = notStartedTasks.length;
    
    const pendingVerificationCount = assignmentsWithTasks.filter(a => 
      a.photoUrl !== null && a.verified === null
    ).length;
    
    const rejectedCount = assignmentsWithTasks.filter(a => 
      a.verified === false
    ).length;
    
    const verifiedCount = assignmentsWithTasks.filter(a => 
      a.verified === true
    ).length;
    
    // ✅ FIXED: Only count assignments marked as expired by cron
    const expiredCount = assignmentsWithTasks.filter(a => 
      a.expired === true
    ).length;
    
    const completedCount = verifiedCount;
    
    // ✅ FIXED: Only count assignments where expired === true (set by cron after grace period)
    const expiredAssignments = assignmentsWithTasks.filter(a => 
      a.expired === true && a.verified !== true
    );
    
    const myNeglectedCount = expiredAssignments.length;
    
    // ✅ Calculate total points lost from missed slots (only from truly expired assignments)
    let myNeglectedPoints = 0;
    for (const a of expiredAssignments) {
      // Check if multi-slot task
      const isMultiSlot = a.task?.timeSlots && a.task.timeSlots.length > 1;
      
      if (isMultiSlot) {
        // For multi-slot, get the missed slot points
        const missedSlotIds = (a as any).missedTimeSlotIds || [];
        const timeSlots = a.task?.timeSlots || [];
        
        // Sum points from missed slots only
        const pointsLost = timeSlots
          .filter(slot => missedSlotIds.includes(slot.id))
          .reduce((total, slot) => total + (slot.points || 0), 0);
        
        myNeglectedPoints += pointsLost;
        
        console.log(`   📊 Multi-slot expired assignment: ${a.task!.title}, missed slots: ${missedSlotIds.length}, points lost: ${pointsLost}`);
      } else {
        // Single-slot task - only count if truly expired
        myNeglectedPoints += (a.points || 0);
        console.log(`   📊 Single-slot expired assignment: ${a.task!.title}, points lost: ${a.points || 0}`);
      }
    }

    // ✅ FIXED: Use UTC for due today calculation
    const startOfDayUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0, 0 
    ));
    const endOfDayUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23, 59, 59, 999
    ));

    // ✅ Only not started tasks are considered for due today
    const dueTodayAssignments = notStartedTasks.filter(assignment => {
      const dueDate = new Date(assignment.dueDate);
      return dueDate >= startOfDayUTC && dueDate <= endOfDayUTC;
    });
    const dueTodayCount = dueTodayAssignments.length;

    // ✅ Only not started tasks are considered for upcoming
    const upcomingAssignments = notStartedTasks.filter(assignment => {
      const dueDate = new Date(assignment.dueDate);
      return !(dueDate >= startOfDayUTC && dueDate <= endOfDayUTC);
    });

    let totalVerifiedPoints = 0;
    let thisWeekVerifiedPoints = 0;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const a of assignmentsWithTasks) {
      const isVerified = a.verified === true;
      
      if (isVerified) {
        const points = a.points || 0;
        totalVerifiedPoints += points;
        
        const verificationDate = a.updatedAt || a.completedAt;
        if (verificationDate && new Date(verificationDate).getTime() > weekAgo.getTime()) {
          thisWeekVerifiedPoints += points;
        }
      }
    }

    const verifiedAssignmentsCount = verifiedCount;
    const totalPoints = assignmentsWithTasks.reduce((sum, a) => sum + (a.points || 0), 0);

    const pendingSwaps = await prisma.swapRequest.count({
      where: {
        OR: [
          { assignment: { userId }, status: "PENDING" },
          { targetUserId: userId, status: "PENDING" }
        ]
      }
    });

    const formattedDueToday = dueTodayAssignments.map(a => ({
      id: a.id,
      taskId: a.taskId,
      title: a.task!.title,
      points: a.points || 0,
      dueDate: a.dueDate,
      timeSlot: a.timeSlot,
      completed: a.completed
    }));

    const formattedUpcoming = upcomingAssignments.slice(0, 10).map(a => ({
      id: a.id,
      taskId: a.taskId,
      title: a.task!.title,
      points: a.points || 0,
      dueDate: a.dueDate,
      timeSlot: a.timeSlot,
      isOverdue: new Date(a.dueDate).getTime() < now.getTime() && !a.expired
    }));

    const formattedNeglected = expiredAssignments.slice(0, 3).map(a => {
      const dueDate = new Date(a.dueDate);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Calculate points lost for display
      let displayPointsLost = a.points || 0;
      const isMultiSlot = a.task?.timeSlots && a.task.timeSlots.length > 1;
      if (isMultiSlot) {
        const missedSlotIds = (a as any).missedTimeSlotIds || [];
        const timeSlots = a.task?.timeSlots || [];
        displayPointsLost = timeSlots
          .filter(slot => missedSlotIds.includes(slot.id))
          .reduce((total, slot) => total + (slot.points || 0), 0);
      }
      
      return {
        id: a.id,
        taskId: a.taskId,
        title: a.task!.title,
        points: displayPointsLost,
        dueDate: a.dueDate,
        expiredAt: a.expiredAt,
        daysOverdue,
        timeSlot: a.timeSlot
      };
    });

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

    console.log(`🏁 [getMemberDashboard] Final stats:`, {
      totalAssignments,
      pendingCount,
      pendingVerificationCount,
      verifiedCount,
      rejectedCount,
      expiredCount,
      dueTodayCount,
      myNeglectedCount,
      myNeglectedPoints,
      upcomingCount: upcomingAssignments.length,
      totalVerifiedPoints,
      thisWeekVerifiedPoints
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
          pendingTasks: pendingCount,
          pendingVerification: pendingVerificationCount,
          completedTasks: verifiedCount,
          rejectedTasks: rejectedCount,
          expiredTasks: expiredCount,
          dueToday: dueTodayCount,
          pendingSwaps,
          pointsThisWeek: thisWeekVerifiedPoints,
          totalPoints: totalVerifiedPoints,
          totalPointsPossible: totalPoints,  
          totalAssignments,
          verifiedAssignmentsCount,
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

// In group.activity.services.ts - FIXED getAdminDashboard

static async getAdminDashboard(groupId: string, userId: string) {
  try {
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

    const tasks = await prisma.task.findMany({
      where: { groupId, isDeleted: false },
      include: {
        _count: {
          select: { assignments: true }
        }
      }
    });

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

    const validAssignments = currentWeekAssignments.filter(a => a.task !== null);
    const now = new Date();

    const totalAssignments = validAssignments.length;
    const completedAssignments = validAssignments.filter(a => a.completed === true).length;
    const verifiedAssignments = validAssignments.filter(a => a.verified === true).length;
    
    // ✅ Pending assignments = not completed, not expired, no photo
    const pendingAssignments = validAssignments.filter(a => 
      !a.completed && !a.expired && a.photoUrl === null
    ).length;
    
    // ✅ Pending verification = has photo AND not verified
    const pendingVerificationCount = validAssignments.filter(a => 
      a.photoUrl !== null && a.verified === null
    ).length;
    
    // ✅ FIXED: ONLY count assignments where expired === true (set by cron after grace period)
    const expiredAssignmentsList = validAssignments.filter(a => 
      a.expired === true && a.verified !== true
    );
    const expiredCount = expiredAssignmentsList.length;
    
    const totalPoints = validAssignments.reduce((sum: number, a: any) => sum + (a.points || 0), 0);
    const earnedPoints = validAssignments
      .filter(a => a.verified === true)
      .reduce((sum: number, a: any) => sum + (a.points || 0), 0);

    const completionPercentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    
    // ✅ Calculate neglected points from truly expired assignments
    let neglectedPoints = 0;
    for (const a of expiredAssignmentsList) {
      const isMultiSlot = a.task?.timeSlots && a.task.timeSlots.length > 1;
      
      if (isMultiSlot) {
        const missedSlotIds = (a as any).missedTimeSlotIds || [];
        const timeSlots = a.task?.timeSlots || [];
        const pointsLost = timeSlots
          .filter(slot => missedSlotIds.includes(slot.id))
          .reduce((total, slot) => total + (slot.points || 0), 0);
        neglectedPoints += pointsLost;
      } else {
        neglectedPoints += (a.points || 0);
      }
    }

    const neglectedByMember: Record<string, { count: number; points: number; name: string }> = {};
    expiredAssignmentsList.forEach((assignment: any) => {
      const memberId = assignment.userId;
      const member = members.find(m => m.userId === memberId);
      const memberName = member?.user?.fullName || 'Unknown';
      
      if (!neglectedByMember[memberId]) {
        neglectedByMember[memberId] = { count: 0, points: 0, name: memberName };
      }
      neglectedByMember[memberId].count++;
      
      // Calculate points lost for this assignment
      let pointsLost = 0;
      const isMultiSlot = assignment.task?.timeSlots && assignment.task.timeSlots.length > 1;
       if (isMultiSlot) {
  const missedSlotIds: string[] = (assignment as any).missedTimeSlotIds || [];
  const timeSlots: Array<{ id: string; points: number | null }> = assignment.task?.timeSlots || [];
  pointsLost = timeSlots
    .filter((slot: { id: string; points: number | null }) => missedSlotIds.includes(slot.id))
    .reduce((total: number, slot: { id: string; points: number | null }) => total + (slot.points || 0), 0);
} else {
  pointsLost = assignment.points || 0;
}
      neglectedByMember[memberId].points += pointsLost;
    });

    console.log('📊 [AdminDashboard] Assignment-level Stats:', {
      totalAssignments,
      completedAssignments,
      verifiedAssignments,
      pendingAssignments,
      pendingVerificationCount,
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
            total: totalAssignments,
            completed: verifiedAssignments,
            pending: pendingAssignments,
            pendingVerification: pendingVerificationCount,
            percentage: completionPercentage,
            activeTotal: totalAssignments - expiredCount - pendingVerificationCount
          },
          points: {
            total: totalPoints,
            earned: earnedPoints,
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

  // ===== GET RECENT ACTIVITY =====
  static async getRecentActivity(groupId: string, userId: string, limit: number = 10) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId }
      });

      if (!membership) {
        return { success: false, message: "You are not a member of this group" };
      }

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

  // ===== GET LEADERBOARD =====
  static async getLeaderboard(groupId: string, userId: string) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId }
      });
      
      if (!membership) {
        return { success: false, message: "You are not a member" };
      }
      
      const members = await prisma.groupMember.findMany({
        where: { 
          groupId, 
          isActive: true, 
          inRotation: true, 
          groupRole: { not: "ADMIN" } 
        },
        include: { 
          user: { 
            select: { 
              id: true, 
              fullName: true, 
              avatarUrl: true 
            } 
          } 
        },
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
        data: { 
          leaderboard, 
          totalPoints: leaderboard.reduce((sum, m) => sum + m.points, 0) 
        }
      };
    } catch (error: any) {
      console.error("Error in getLeaderboard:", error);
      return { success: false, message: error.message };
    }
  }
}