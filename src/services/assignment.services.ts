// services/assignment.services.ts - COMPLETE FIXED VERSION
import prisma from "../prisma";
import { AssignmentHelpers } from "../helpers/assignment.helpers";
import { TimeHelpers } from "../helpers/time.helpers";
import { UserNotificationService } from "./user.notification.services";
import { SocketService } from './socket.services';


export class AssignmentService {
private static getUTCToday(): { todayUTC: Date; tomorrowUTC: Date } {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  const tomorrowUTC = new Date(todayUTC);
  tomorrowUTC.setUTCDate(todayUTC.getUTCDate() + 1);
  return { todayUTC, tomorrowUTC };
}

// services/assignment.services.ts - COMPLETE FIX for multi-slot late submissions

static async completeAssignment(
  assignmentId: string,
  userId: string,
  data: { 
    photoUrl?: string;   
    notes?: string;
    timeSlotId?: string;
  }
) {
  let timeValidation;
  let admins: any[] = []; 
  try {
    console.log('🔵🔵🔵 [COMPLETE ASSIGNMENT] START 🔵🔵🔵');
    
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        user: {
          select: { id: true, fullName: true, avatarUrl: true }
        },
        task: {
          include: {
            group: true,
            timeSlots: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        },
        timeSlot: true
      }
    });

    if (!assignment) {
      return { success: false, message: "Assignment not found" };
    }

    if (assignment.expired === true) {
      return { 
        success: false, 
        message: "This assignment has already expired and cannot be completed." 
      };
    }

    if (assignment.userId !== userId) {
      return { success: false, message: "You can only complete your own assignments" };
    }

    if (assignment.completed) {
      return { success: false, message: "Assignment already completed" };
    }

    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    
    const isSameDayUTC = 
      now.getUTCFullYear() === dueDate.getUTCFullYear() &&
      now.getUTCMonth() === dueDate.getUTCMonth() &&
      now.getUTCDate() === dueDate.getUTCDate();
    
    if (!isSameDayUTC) {
      return { 
        success: false, 
        message: `Cannot complete assignment on this date. It's due on ${dueDate.toISOString().split('T')[0]}`
      };
    }

    const assignmentAny = assignment as any;
    const completedSlotIds: string[] = assignmentAny.completedTimeSlotIds || [];
    const missedSlotIds: string[] = assignmentAny.missedTimeSlotIds || [];
    
    // Determine which time slot is being completed
    let targetTimeSlot = null;
    let slotPoints = 0;
    let isMultiSlotTask = assignment.task.timeSlots && assignment.task.timeSlots.length > 1;
    
    if (isMultiSlotTask) {
      if (!data.timeSlotId) {
        return { 
          success: false, 
          message: "Please select which time slot you are completing" 
        };
      }
      
      const foundSlot = assignment.task.timeSlots.find((slot: any) => slot.id === data.timeSlotId);
      
      if (!foundSlot) {
        return { success: false, message: "Invalid time slot specified" };
      }
      
      targetTimeSlot = foundSlot;
      
      // Check if this slot was already completed
      if (completedSlotIds.includes(targetTimeSlot.id)) {
        return { 
          success: false, 
          message: `Time slot ${targetTimeSlot.startTime}-${targetTimeSlot.endTime} was already completed` 
        };
      }
      
      if (missedSlotIds.includes(targetTimeSlot.id)) {
        return { 
          success: false, 
          message: `Time slot ${targetTimeSlot.startTime}-${targetTimeSlot.endTime} was already missed and cannot be completed` 
        };
      }
      
      slotPoints = targetTimeSlot.points || assignment.points;
    } else {
      targetTimeSlot = assignment.timeSlot;
      slotPoints = assignment.points;
    }

    // ✅ Validate submission time for THIS SPECIFIC slot
    let finalPointsForThisSlot = slotPoints;
    let isLateForThisSlot = false;
    let penaltyAmount = 0;

    if (targetTimeSlot) {
      const tempAssignment = {
        ...assignment,
        timeSlot: targetTimeSlot
      };
      
      console.log(`⏰ Checking submission time for slot ${targetTimeSlot.startTime}-${targetTimeSlot.endTime}`);
      timeValidation = TimeHelpers.canSubmitAssignment(tempAssignment, now);
      
      console.log(`⏰ Time validation result:`, {
        allowed: timeValidation.allowed,
        reason: timeValidation.reason,
        willBePenalized: timeValidation.willBePenalized,
        submissionStatus: timeValidation.submissionStatus
      });
      
      if (!timeValidation.allowed) {
        let errorMessage = "Cannot submit assignment at this time.";
        
        if (timeValidation.reason === 'Submission not open yet') {
          errorMessage = `Submission opens at ${targetTimeSlot.endTime}. Please wait until then.`;
        } else if (timeValidation.reason === 'Submission window closed') {
          errorMessage = `Submission window for ${targetTimeSlot.startTime}-${targetTimeSlot.endTime} has closed.`;
        } else if (timeValidation.reason === 'Not due date') {
          errorMessage = `This assignment is due on ${dueDate.toISOString().split('T')[0]}. Please complete it on that day.`;
        }
        
        return { 
          success: false, 
          message: errorMessage,
          validation: timeValidation
        };
      }
      
      // ✅ This is for THIS SPECIFIC slot only
      isLateForThisSlot = timeValidation.willBePenalized || false;
      
      if (isLateForThisSlot) {
        penaltyAmount = Math.floor(slotPoints * 0.5);
        finalPointsForThisSlot = slotPoints - penaltyAmount;
        console.log(`⚠️ LATE SUBMISSION for slot ${targetTimeSlot.startTime}-${targetTimeSlot.endTime}! Points reduced from ${slotPoints} to ${finalPointsForThisSlot}`);
      } else {
        console.log(`✅ ON TIME submission for slot ${targetTimeSlot.startTime}-${targetTimeSlot.endTime}! Points: ${slotPoints}`);
      }
    }
 
    // ✅ Update completed time slots - apply penalty ONLY to this slot
    let updatedCompletedSlots = [...completedSlotIds];
    let updatedPoints = assignment.points;
    let allSlotsCompleted = false; 
    
    if (isMultiSlotTask && targetTimeSlot) {
      updatedCompletedSlots = [...completedSlotIds, targetTimeSlot.id];
      console.log(`📊 Updated completed slots: ${updatedCompletedSlots.length}/${assignment.task.timeSlots.length}`);
      
      // ✅ Calculate total points - penalty applied ONLY to this slot if late
      let totalCompletedPoints = 0;
      for (const slot of assignment.task.timeSlots) {
        if (updatedCompletedSlots.includes(slot.id)) { 
          let slotPointsValue = slot.points || assignment.points;
          
          // ✅ Apply penalty ONLY to the slot being submitted NOW, and ONLY if late
          if (slot.id === targetTimeSlot.id && isLateForThisSlot) {
            slotPointsValue = finalPointsForThisSlot;
            console.log(`💰 Late penalty applied to slot ${slot.startTime}-${slot.endTime}: ${slot.points || assignment.points} → ${slotPointsValue}`);
          }
          
          totalCompletedPoints += slotPointsValue;
        }
      }
      updatedPoints = totalCompletedPoints;
      console.log(`💰 Updated total points: ${updatedPoints} (${updatedCompletedSlots.length}/${assignment.task.timeSlots.length} slots completed)`);
      
      allSlotsCompleted = updatedCompletedSlots.length === assignment.task.timeSlots.length;
      console.log(`🏁 All slots completed? ${allSlotsCompleted}`);
    } else {
      allSlotsCompleted = true; 
      updatedPoints = finalPointsForThisSlot;
      console.log(`🏁 Single slot task - marking as completed with points: ${updatedPoints}`);
    }

    // ✅ For multi-slot tasks, mark for verification after EACH slot submission
    const shouldMarkForVerification = isMultiSlotTask ? true : allSlotsCompleted;

    // ✅ Update assignment
    const updateData: any = {
      completed: allSlotsCompleted,
      completedAt: allSlotsCompleted ? new Date() : undefined,
      photoUrl: data.photoUrl || undefined,
      notes: data.notes || (isLateForThisSlot ? `[LATE: Submitted after ${targetTimeSlot?.endTime}]` : undefined),
      points: updatedPoints 
    };
    
    if (shouldMarkForVerification) {
      updateData.verified = null;
    } else {
      updateData.verified = undefined;
    }
    
    if (isMultiSlotTask && targetTimeSlot) {
      updateData.completedTimeSlotIds = updatedCompletedSlots;
    }
    
    console.log(`💾 Updating assignment with:`, updateData);
    
    const updatedAssignment = await prisma.assignment.update({
      where: { id: assignmentId },
      data: updateData,
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        task: {
          select: {
            id: true,
            title: true,
            points: true,
            group: { select: { id: true, name: true } },
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
      }
    });

    // ✅ Get admins to notify
    if (assignment.task?.groupId) {
      admins = await prisma.groupMember.findMany({
        where: {
          groupId: assignment.task.groupId,
          groupRole: "ADMIN",
          isActive: true
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          }
        }
      });
    }

    // ✅ Send notification to admins
    for (const admin of admins) {
      await UserNotificationService.createNotification({
        userId: admin.userId,
        type: "SUBMISSION_PENDING",
        title: "📸 New Submission Ready for Review",
        message: `${assignment.user?.fullName || 'A member'} submitted "${assignment.task!.title}" (${targetTimeSlot?.startTime}-${targetTimeSlot?.endTime}) for verification. ${isLateForThisSlot ? '⚠️ Late submission - points reduced.' : '✅ On-time submission.'}`,
        data: {
          assignmentId: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task!.title,
          groupId: assignment.task!.groupId,
          groupName: assignment.task!.group?.name,
          userId: assignment.userId,
          userName: assignment.user?.fullName,
          timeSlot: targetTimeSlot ? {
            startTime: targetTimeSlot.startTime,
            endTime: targetTimeSlot.endTime,
            label: targetTimeSlot.label
          } : null,
          isLate: isLateForThisSlot,
          originalPoints: slotPoints,
          finalPoints: finalPointsForThisSlot,
          slotsCompleted: updatedCompletedSlots.length,
          totalSlots: assignment.task.timeSlots.length,
          allSlotsCompleted
        }
      });
    }

    let successMessage = "";
    if (allSlotsCompleted) {
      successMessage = isLateForThisSlot 
        ? `All time slots completed! Last slot submitted late. Final points: ${updatedPoints}. Waiting for admin verification.`
        : "All time slots completed successfully! Waiting for admin verification.";
    } else {
      successMessage = `Completed ${targetTimeSlot?.startTime}-${targetTimeSlot?.endTime} ${isLateForThisSlot ? '(late)' : '(on time)'}. ${updatedCompletedSlots.length}/${assignment.task.timeSlots.length} slots done. ${updatedCompletedSlots.length === assignment.task.timeSlots.length - 1 ? 'One more slot to go!' : ''}`;
    }
    
    console.log(`🎉 SUCCESS! ${successMessage}`);

    return {
      success: true,
      message: successMessage,
      assignment: updatedAssignment,
      isLate: isLateForThisSlot,
      penaltyAmount,
      originalPoints: slotPoints,
      finalPoints: finalPointsForThisSlot,
      slotsCompleted: updatedCompletedSlots.length,
      totalSlots: assignment.task.timeSlots.length,
      allSlotsCompleted,
      notifications: {
        notifiedAdmins: admins.length,
        showSuccessNotification: true
      }
    }; 

  } catch (error: any) {
    console.error('❌❌❌ [COMPLETE ASSIGNMENT] ERROR ❌❌❌');
    console.error(error);
    return { success: false, message: error.message || "Error completing assignment" };
  }
}

 
// ========== VERIFY ASSIGNMENT ==========
static async verifyAssignment(
  assignmentId: string,
  userId: string,
  data: {
    verified: boolean;
    adminNotes?: string;
  }
) {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        task: {
          include: {
            group: true,
            timeSlots: true
          }
        },
        user: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    });

    if (!assignment) {
      return { success: false, message: "Assignment not found" };
    }

    if (!assignment.task) {
      return { 
        success: false, 
        message: "The task associated with this assignment has been deleted" 
      };
    }

    const membership = await prisma.groupMember.findFirst({
      where: {
        userId,
        groupId: assignment.task.groupId,
        groupRole: "ADMIN"
      }
    });

    if (!membership) {
      return { success: false, message: "Only group admins can verify assignments" };
    }

    // ✅ Allow verification for:
    // 1. Fully completed assignments (completed = true)
    // 2. Partially completed multi-slot assignments (has photo, verified = null)
    const isMultiSlotTask = assignment.task.timeSlots && assignment.task.timeSlots.length > 1;
    const hasSubmission = assignment.photoUrl !== null;
    
    if (!isMultiSlotTask && !assignment.completed) {
      return { success: false, message: "Assignment must be completed before verification" };
    }
    
    // For multi-slot tasks, allow verification even if not fully completed
    if (isMultiSlotTask && !hasSubmission) {
      return { success: false, message: "No submission to verify" };
    }

    const updatedAssignment = await prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        verified: data.verified,
        adminNotes: data.adminNotes || undefined
      },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        task: {
          select: {
            id: true,
            title: true,
            points: true,
            group: { select: { id: true, name: true } }
          }
        },
        timeSlot: true
      }
    });

    // ✅ FIXED: Award exactly the points stored in assignment.points
    // The completeAssignment function already calculated the correct reduced points for late submissions
    let pointsToAward = assignment.points || 0;
    
    console.log(`💰 [VERIFY] Awarding ${pointsToAward} points for assignment ${assignmentId}`);
    console.log(`   Task: ${assignment.task.title}`);
    console.log(`   Notes contain late: ${assignment.notes?.includes('[LATE:') || false}`);
    
    // ✅ Award points only when verified (approved)
    if (data.verified === true && pointsToAward > 0) {
      await prisma.groupMember.updateMany({
        where: {
          userId: assignment.userId,
          groupId: assignment.task.groupId,
          isActive: true
        },
        data: {
          cumulativePoints: {
            increment: pointsToAward
          },
          pointsUpdatedAt: new Date()
        }
      }); 
      
      console.log(`💰💰💰 [POINTS AWARDED] User ${assignment.userId} earned +${pointsToAward} points for verified assignment ${assignmentId}`);
    } else if (data.verified === false) {
      console.log(`⚠️ [ASSIGNMENT REJECTED] No points awarded for assignment ${assignmentId}`);
    }

    const notificationType = data.verified ? "SUBMISSION_VERIFIED" : "SUBMISSION_REJECTED";
    const notificationTitle = data.verified ? "✅ Task Verified" : "❌ Task Rejected";
    const notificationMessage = data.verified 
      ? `✅ Your submission for "${assignment.task.title}" has been verified! You earned ${pointsToAward} points.`
      : `❌ Your submission for "${assignment.task.title}". No points awarded.`;

    await UserNotificationService.createNotification({
      userId: assignment.userId,
      type: notificationType,
      title: notificationTitle,
      message: notificationMessage,
      data: {
        assignmentId: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task.title,
        groupId: assignment.task.group.id,
        groupName: assignment.task.group.name,
        verified: data.verified,
        adminNotes: data.adminNotes,
        points: pointsToAward,
        verifiedBy: userId,
        verifiedAt: new Date(),
        pointsAwarded: data.verified ? pointsToAward : 0
      }
    });

    const verifierName = await prisma.user.findUnique({ 
      where: { id: userId }, 
      select: { fullName: true } 
    });

    await SocketService.emitAssignmentVerified(
      assignment.id,
      assignment.taskId || 'unknown-task',
      assignment.task.title,
      assignment.userId,
      assignment.user?.fullName || 'Unknown',
      assignment.task.groupId,
      data.verified,
      userId,
      verifierName?.fullName || 'Admin',
      pointsToAward
    );

    const otherAdmins = await prisma.groupMember.findMany({
      where: {
        groupId: assignment.task.groupId,
        groupRole: "ADMIN",
        isActive: true,
        userId: { not: userId }
      }
    });

    for (const admin of otherAdmins) {
      await UserNotificationService.createNotification({
        userId: admin.userId,
        type: "SUBMISSION_DECISION",
        title: data.verified ? "✅ Submission Verified" : "❌ Submission Rejected",
        message: `${assignment.user?.fullName || 'Unknown'}'s submission for "${assignment.task.title}" was ${data.verified ? 'verified' : 'rejected'}${data.verified ? ` and awarded ${pointsToAward} points` : ''}`,
        data: {
          assignmentId: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task.title,
          groupId: assignment.task.group.id,
          groupName: assignment.task.group.name,
          userId: assignment.userId,
          userName: assignment.user?.fullName || 'Unknown',
          verified: data.verified,
          adminNotes: data.adminNotes,
          verifiedBy: userId,
          verifiedAt: new Date(),
          pointsAwarded: data.verified ? pointsToAward : 0
        }
      });
    }

    return { 
      success: true,
      message: data.verified ? "Assignment verified successfully! Points awarded." : "Assignment rejected. No points awarded.",
      assignment: updatedAssignment,
      pointsAwarded: data.verified ? pointsToAward : 0,
      notifications: {
        notifiedUser: true,
        notifiedOtherAdmins: otherAdmins.length
      }
    };
 
  } catch (error: any) {
    console.error("AssignmentService.verifyAssignment error:", error);
    return { success: false, message: error.message || "Error verifying assignment" };
  }
}

  // ========== CHECK NEGLECTED ASSIGNMENTS (FOR CRON) ==========
  static async checkNeglectedAssignments() {
    try {
      const groups = await prisma.group.findMany({ select: { id: true } });
      let totalNeglected = 0;
      let totalPointsNotAwarded = 0;

      for (const group of groups) {
        const result = await this.checkGroupNeglectedAssignments(group.id);
        totalNeglected += result.count;
        totalPointsNotAwarded += result.pointsNotAwarded || 0;
      }

      console.log(`💰 Total points not awarded across all groups: ${totalPointsNotAwarded}`);
      
      return { 
        success: true, 
        totalNeglected,
        totalPointsNotAwarded
      };
    } catch (error: any) {
      console.error("AssignmentService.checkNeglectedAssignments error:", error);
      return { success: false, message: error.message };
    }
  }

// In assignment.services.ts - FIXED getAssignmentDetails with UTC date conversion

static async getAssignmentDetails(assignmentId: string, userId: string) {
  try {
    console.log('🔍 [getAssignmentDetails] Fetching assignment:', assignmentId);
    
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        task: {
          include: {
            group: true,
            timeSlots: true
          }
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true
          }
        },
        timeSlot: true
      }
    });

    if (!assignment) {
      return { success: false, message: "Assignment not found" };
    }

    let isGroupAdmin = false;
    if (assignment.task?.groupId) {
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId: assignment.task.groupId,
          groupRole: "ADMIN"
        }
      });
      isGroupAdmin = !!membership;
    }

    const isAssignee = assignment.userId === userId;

    if (!isAssignee && !isGroupAdmin) {
      return { 
        success: false, 
        message: "You don't have permission to view this assignment" 
      };
    }

    let swapInfo = null;
    
    if (isAssignee) {
      const swapRequest = await prisma.swapRequest.findFirst({
        where: {
          OR: [
            { acceptedBy: userId, assignmentId: assignment.id },
            { targetUserId: userId, assignmentId: assignment.id, status: 'ACCEPTED' }
          ],
          status: 'ACCEPTED'
        },
        select: {
          id: true,
          requestedBy: true,
          scope: true,
          selectedDay: true,
          createdAt: true
        }
      });
      
      if (swapRequest) {
        let swappedFromName = 'another member';
        if (swapRequest.requestedBy) {
          const requester = await prisma.user.findUnique({
            where: { id: swapRequest.requestedBy },
            select: { fullName: true }
          });
          if (requester?.fullName) {
            swappedFromName = requester.fullName;
          }
        }
        
        swapInfo = {
          acquiredViaSwap: true,
          swapRequestId: swapRequest.id,
          swappedFromId: swapRequest.requestedBy,
          swappedFromName: swappedFromName,
          swapScope: swapRequest.scope,
          swapDay: swapRequest.selectedDay,
          swapCreatedAt: swapRequest.createdAt
        };
      }
    }

    // ✅ CONVERT ALL DATES TO ISO STRINGS (UTC)
    const formattedAssignment = {
      ...assignment,
      dueDate: assignment.dueDate instanceof Date ? assignment.dueDate.toISOString() : assignment.dueDate,
      weekStart: assignment.weekStart instanceof Date ? assignment.weekStart.toISOString() : assignment.weekStart,
      weekEnd: assignment.weekEnd instanceof Date ? assignment.weekEnd.toISOString() : assignment.weekEnd,
      completedAt: assignment.completedAt instanceof Date ? assignment.completedAt.toISOString() : assignment.completedAt,
      createdAt: assignment.createdAt instanceof Date ? assignment.createdAt.toISOString() : assignment.createdAt,
      updatedAt: assignment.updatedAt instanceof Date ? assignment.updatedAt.toISOString() : assignment.updatedAt,
      isAdmin: isGroupAdmin,
      isOwner: isAssignee,
      acquiredViaSwap: swapInfo?.acquiredViaSwap || false,
      swapRequestId: swapInfo?.swapRequestId || null,
      swappedFromId: swapInfo?.swappedFromId || null,
      swappedFromName: swapInfo?.swappedFromName || null, 
      swapScope: swapInfo?.swapScope || null,
      swapDay: swapInfo?.swapDay || null,
      swapCreatedAt: swapInfo?.swapCreatedAt ? (swapInfo.swapCreatedAt instanceof Date ? swapInfo.swapCreatedAt.toISOString() : swapInfo.swapCreatedAt) : null
    };

    console.log('✅ [getAssignmentDetails] Success, returning assignment with UTC dates');

    return {
      success: true, 
      assignment: formattedAssignment
    };

  } catch (error: any) {
    console.error("Error fetching assignment details:", error);
    return { success: false, message: error.message };
  }
}
  

  // ========== GET GROUP ASSIGNMENTS ==========
  static async getGroupAssignments(
    groupId: string,
    requestingUserId: string,
    filters: {
      status?: string;
      week?: number;
      userId?: string;
      limit: number;
      offset: number;
    }
  ) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: { userId: requestingUserId, groupId, groupRole: "ADMIN" }
      });

      if (!membership) {
        return { success: false, message: "Only group admins can view all assignments" };
      }

      const membersInRotation = await prisma.groupMember.findMany({
        where: { 
          groupId, 
          isActive: true, 
          inRotation: true
        },
        select: { userId: true }
      });

      const memberIdsInRotation = membersInRotation.map(m => m.userId);

      const where: any = { 
        task: { groupId },
        userId: { in: memberIdsInRotation }
      };

     // Fix the status filter in getGroupAssignments
if (filters.status) {
  switch (filters.status) {
    case 'pending':
      where.completed = false;
      where.expired = false;
      break;
    case 'completed':
      where.completed = true;
      where.verified = null;
      break;
    case 'pending_verification':
      where.OR = [
        { completed: true, verified: null },
        { completed: false, verified: null, photoUrl: { not: null } }
      ];
      break;
    case 'verified':
      // ✅ FIX: Only show assignments with verified = true
      where.verified = true;
      break;
    case 'rejected':
      // ✅ FIX: Only show assignments with verified = false
      where.verified = false;
      break;
          case 'neglected':  // ✅ ADD THIS CASE
      where.OR = [
        { expired: true },
        { partiallyExpired: true }
      ];
      where.completed = false;
      break;
  }
}


      if (filters.userId) {
        if (!memberIdsInRotation.includes(filters.userId)) {
          return { 
            success: false, 
            message: "Selected user is not in rotation or does not exist" 
          };
        }
        where.userId = filters.userId;
      }

      if (filters.week !== undefined) where.rotationWeek = filters.week;

      const [assignments, total] = await Promise.all([
        prisma.assignment.findMany({
          where,
          include: {
            user: { select: { id: true, fullName: true, avatarUrl: true } },
            task: { select: { id: true, title: true, points: true, executionFrequency: true } },
            timeSlot: true
          },
          orderBy: [{ dueDate: 'asc' }, { completed: 'asc' }],
          take: filters.limit,
          skip: filters.offset
        }),
        prisma.assignment.count({ where })
      ]);

      const validAssignments = assignments.filter(a => a.task !== null);
      
      const formattedAssignments = validAssignments.map(assignment => {
        const verificationStatus = AssignmentHelpers.getVerificationStatus(assignment);
        const timeUntilDue = AssignmentHelpers.getTimeUntilDue(assignment.dueDate);
        
        return {
          id: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task!.title,
          user: assignment.user,
          points: assignment.points,
          completed: assignment.completed,
          verified: assignment.verified,
          verificationStatus,
          photoUrl: assignment.photoUrl,
          notes: assignment.notes,
          adminNotes: assignment.adminNotes,
          dueDate: assignment.dueDate,
          completedAt: assignment.completedAt,
          timeUntilDue,
          timeSlot: assignment.timeSlot,
          rotationWeek: assignment.rotationWeek
        };
      });

      const historicalWhere: any = {
        taskId: null,
        taskTitle: { not: null },
        user: { groups: { some: { groupId } } },
        userId: { in: memberIdsInRotation }
      };

      if (filters.userId) historicalWhere.userId = filters.userId;
      if (filters.week !== undefined) historicalWhere.rotationWeek = filters.week;

      const historicalAssignments = await prisma.assignment.findMany({
        where: historicalWhere,
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          timeSlot: true
        },
        orderBy: { dueDate: 'asc' }
      });

      const formattedHistorical = historicalAssignments.map(assignment => ({
        id: assignment.id,
        taskId: null,
        taskTitle: assignment.taskTitle || "Deleted Task",
        user: assignment.user,
        points: assignment.taskPoints || assignment.points,
        completed: assignment.completed,
        verified: assignment.verified,
        verificationStatus: assignment.verified ? 'verified' : (assignment.completed ? 'pending' : 'incomplete'),
        photoUrl: assignment.photoUrl,
        notes: assignment.notes,
        adminNotes: assignment.adminNotes,
        dueDate: assignment.dueDate,
        completedAt: assignment.completedAt,
        timeUntilDue: AssignmentHelpers.getTimeUntilDue(assignment.dueDate),
        timeSlot: assignment.timeSlot,
        rotationWeek: assignment.rotationWeek,
        isHistorical: true
      }));

      const adminCount = await prisma.groupMember.count({
        where: { groupId, groupRole: "ADMIN", isActive: true }
      });

      return {
        success: true,
        message: "Group assignments retrieved successfully",
        assignments: [...formattedAssignments, ...formattedHistorical],
        total: validAssignments.length + historicalAssignments.length,
        filters,
        stats: {
          totalAssignments: validAssignments.length + historicalAssignments.length,
          membersInRotation: memberIdsInRotation.length,
          adminsCount: adminCount
        }
      };

    } catch (error: any) {
      console.error("AssignmentService.getGroupAssignments error:", error);
      return { success: false, message: error.message || "Error retrieving group assignments" };
    }
  }

// In assignment.services.ts - COMPLETELY FIXED getUserNeglectedTasks

static async getUserNeglectedTasks(userId: string, filters?: {
  groupId?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    if (filters?.groupId) {
      const membership = await prisma.groupMember.findFirst({
        where: { 
          userId, 
          groupId: filters.groupId,
          isActive: true
        },
        select: { groupRole: true }
      });

      if (!membership) {
        return { 
          success: false, 
          message: "You are not a member of this group" 
        };
      }
    }

    const where: any = { 
      userId,
      completed: false,
      AND: [
        {
          OR: [
            { expired: true },
            { partiallyExpired: true }
          ]
        },
        {
          OR: [
            { verified: false },
            { verified: null }
          ]
        }
      ] 
    };

    if (filters?.groupId) {
      where.task = {
        groupId: filters.groupId
      };
    }

    const [neglectedTasks, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
        select: {
          id: true,
          userId: true,
          taskId: true,
          dueDate: true,
          expiredAt: true,        // ✅ ADDED - CRITICAL!
          expired: true,
          points: true,
          notes: true,
          photoUrl: true,
          completed: true,
          verified: true,
          completedTimeSlotIds: true,
          missedTimeSlotIds: true,
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
              group: {
                select: {
                  id: true,
                  name: true
                }
              },
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
        orderBy: { expiredAt: 'desc' },
        take: filters?.limit || 20,
        skip: filters?.offset || 0
      }),
      prisma.assignment.count({ where })
    ]);

    console.log(`\n📊 ========== getUserNeglectedTasks ==========`);
    console.log(`📊 Found ${neglectedTasks.length} assignments with missed slots for user ${userId}`);
    console.log(`==========================================\n`);

    // ✅ FLATTEN: Create separate entry for EACH missed slot
    const formattedTasks = neglectedTasks.flatMap(assignment => {
      const missedSlotIds = (assignment as any).missedTimeSlotIds || [];
      const timeSlots = (assignment.task?.timeSlots || []) as any[];
      
      // Find missed slots with full details
      const missedSlots = timeSlots.filter(slot => missedSlotIds.includes(slot.id));
      
      const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
      const dueHourPHT = dueDate ? dueDate.getUTCHours() + 8 : 0;
      
      console.log(`\n🔍🔍🔍 [USER NEGLECTED ASSIGNMENT] 🔍🔍🔍`);
      console.log(`   Assignment ID: ${assignment.id}`);
      console.log(`   Task Title: ${assignment.task?.title}`);
      console.log(`   Due Date (UTC): ${assignment.dueDate?.toISOString()}`);
      console.log(`   Due Hour PHT: ${dueHourPHT}:00`);
      console.log(`   Expired At (UTC): ${assignment.expiredAt?.toISOString()}`);
      console.log(`   Total missed slots: ${missedSlots.length}`);
      
      if (missedSlots.length === 0) {
        console.log(`   ⚠️ No missed slots found, skipping`);
        return [];
      }
      
      // Log all missed slots
      missedSlots.forEach((slot: any, idx: number) => {
        console.log(`   Missed slot ${idx + 1}: ${slot.startTime}-${slot.endTime} (ID: ${slot.id}, points: ${slot.points})`);
      });
      
      // ✅ Create SEPARATE entry for EACH missed slot
      return missedSlots.map(slot => {
        const endHour = parseInt(slot.endTime.split(':')[0]);
        const hourDiff = Math.abs(endHour - dueHourPHT);
        
        console.log(`\n   📦 Creating separate entry for slot: ${slot.startTime}-${slot.endTime}`);
        console.log(`      Slot end hour: ${endHour}, Due hour PHT: ${dueHourPHT}, Hour diff: ${hourDiff}`);
        console.log(`      Points: ${slot.points || 0}`);
        
        return {
          id: `${assignment.id}_${slot.id}`,  // Unique ID per slot
          originalAssignmentId: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task?.title || 'Deleted Task',
          groupId: assignment.task?.group?.id || filters?.groupId,
          groupName: assignment.task?.group?.name || 'Unknown Group',
          dueDate: assignment.dueDate,
          expiredAt: assignment.expiredAt,    // ✅ NOW HAS VALUE
          points: slot.points || 0,
          timeSlot: {
            id: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            label: slot.label,
            points: slot.points
          },
          notes: assignment.notes,
          user: assignment.user,
          slotId: slot.id,
          slotTime: `${slot.startTime}-${slot.endTime}`,
          slotLabel: slot.label || '',
          missedSlotIds: [slot.id],
          missedSlotsCount: 1,
          daysAgo: assignment.expiredAt 
            ? Math.floor((new Date().getTime() - new Date(assignment.expiredAt).getTime()) / (1000 * 60 * 60 * 24))
            : 0
        };
      });
    });

    console.log(`\n📊 ========== getUserNeglectedTasks SUMMARY ==========`);
    console.log(`   Original assignments: ${neglectedTasks.length}`);
    console.log(`   Individual slot entries: ${formattedTasks.length}`);
    formattedTasks.forEach((task, idx) => {
      console.log(`   ${idx + 1}. ${task.taskTitle} - Slot: ${task.timeSlot?.startTime}-${task.timeSlot?.endTime} - Points: ${task.points} - Expired: ${task.expiredAt}`);
    });
    console.log(`==================================================\n`);

    const totalPointsLost = formattedTasks.reduce((sum, task) => sum + task.points, 0);
    
    const groupedByMonth = formattedTasks.reduce((acc: any, task) => {
      if (!task.expiredAt) return acc;
      const date = new Date(task.expiredAt);
      const monthYear = date.toLocaleString('default', { 
        month: 'long', 
        year: 'numeric' 
      });
      if (!acc[monthYear]) {
        acc[monthYear] = [];
      }
      acc[monthYear].push(task);
      return acc;
    }, {});

    return {
      success: true,
      message: "Neglected tasks retrieved successfully",
      data: {
        tasks: formattedTasks,
        groupedByMonth,
        summary: {
          total: formattedTasks.length,
          count: formattedTasks.length,
          totalPointsLost,
          averagePointsLost: formattedTasks.length > 0 
            ? Math.round(totalPointsLost / formattedTasks.length) 
            : 0
        },
        pagination: {
          limit: filters?.limit || 20,
          offset: filters?.offset || 0,
          hasMore: (filters?.offset || 0) + formattedTasks.length < total
        }
      }
    };

  } catch (error: any) {
    console.error("Error getting user neglected tasks:", error);
    return { 
      success: false, 
      message: error.message || "Error retrieving neglected tasks",
      data: {
        tasks: [],
        groupedByMonth: {},
        summary: {
          total: 0,
          count: 0,
          totalPointsLost: 0,
          averagePointsLost: 0
        },
        pagination: {
          limit: filters?.limit || 20,
          offset: filters?.offset || 0,
          hasMore: false
        }
      }
    };
  }
}

// In assignment.services.ts - COMPLETELY FIXED getGroupNeglectedTasks

static async getGroupNeglectedTasks(
  groupId: string,
  userId: string, 
  filters?: {
    memberId?: string;
    limit?: number;
    offset?: number;
  }
) {
  try {
    const membership = await prisma.groupMember.findFirst({
      where: {
        userId,
        groupId,
        groupRole: "ADMIN"
      }
    });

    if (!membership) {
      return { success: false, message: "Only admins can view all neglected tasks" };
    }

    const where: any = {
      task: { groupId },
      completed: false,
      AND: [
        {
          OR: [
            { expired: true },
            { partiallyExpired: true }
          ]
        },
        {
          OR: [
            { verified: false },
            { verified: null }
          ]
        }
      ]
    };

    if (filters?.memberId) {
      where.userId = filters.memberId;
    }

    console.log(`📊 Querying neglected tasks with where clause:`, JSON.stringify(where, null, 2));

    const [neglectedTasks, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
        select: {
          id: true,
          userId: true,
          taskId: true,
          dueDate: true,
          expiredAt: true,        // ✅ ADDED - CRITICAL!
          expired: true,
          points: true,
          notes: true,
          photoUrl: true,
          completed: true,
          verified: true,
          completedTimeSlotIds: true,
          missedTimeSlotIds: true,
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
        orderBy: { expiredAt: 'desc' },
        take: filters?.limit || 20,
        skip: filters?.offset || 0
      }),
      prisma.assignment.count({ where })
    ]);

    console.log(`\n📊 ========== getGroupNeglectedTasks ==========`);
    console.log(`📊 Found ${neglectedTasks.length} assignments with missed slots in group ${groupId}`);
    console.log(`==========================================\n`);

    const pointsByUser: Record<string, number> = {};
    
    // ✅ FLATTEN: Create separate entry for EACH missed slot
    const formattedTasks = neglectedTasks.flatMap(assignment => {
      const missedSlotIds = (assignment as any).missedTimeSlotIds || [];
      const timeSlots = (assignment.task?.timeSlots || []) as any[];
      
      // Find missed slots with full details
      const missedSlots = timeSlots.filter(slot => missedSlotIds.includes(slot.id));
      
      const dueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
      const dueHourPHT = dueDate ? dueDate.getUTCHours() + 8 : 0;
      
      console.log(`\n🔍🔍🔍 [GROUP NEGLECTED ASSIGNMENT] 🔍🔍🔍`);
      console.log(`   Assignment ID: ${assignment.id}`);
      console.log(`   User: ${assignment.user?.fullName}`);
      console.log(`   Task Title: ${assignment.task?.title}`);
      console.log(`   Due Date (UTC): ${assignment.dueDate?.toISOString()}`);
      console.log(`   Due Hour PHT: ${dueHourPHT}:00`);
      console.log(`   Expired At (UTC): ${assignment.expiredAt?.toISOString()}`);
      console.log(`   Total missed slots: ${missedSlots.length}`);
      console.log(`📊 Raw assignment data from DB:`, {
  id: assignment.id,
  expired: assignment.expired,
  expiredAt: assignment.expiredAt,
  completed: assignment.completed
});
      if (missedSlots.length === 0) {
        console.log(`   ⚠️ No missed slots found, skipping`);
        return [];
      }
      
      // Log all missed slots
      missedSlots.forEach((slot: any, idx: number) => {
        console.log(`   Missed slot ${idx + 1}: ${slot.startTime}-${slot.endTime} (ID: ${slot.id}, points: ${slot.points})`);
      });
      
      // ✅ Create SEPARATE entry for EACH missed slot
      return missedSlots.map(slot => {
        const endHour = parseInt(slot.endTime.split(':')[0]);
        const hourDiff = Math.abs(endHour - dueHourPHT);
        const slotPoints = slot.points || 0;
        
        console.log(`\n   📦 Creating separate entry for slot: ${slot.startTime}-${slot.endTime}`);
        console.log(`      Slot end hour: ${endHour}, Due hour PHT: ${dueHourPHT}, Hour diff: ${hourDiff}`);
        console.log(`      Points: ${slotPoints}`);
        
        // Accumulate points by user (for stats)
        pointsByUser[assignment.userId] = (pointsByUser[assignment.userId] || 0) + slotPoints;
        
        return {
          id: `${assignment.id}_${slot.id}`,  // Unique ID per slot
          originalAssignmentId: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task?.title || 'Deleted Task',
          user: assignment.user,
          dueDate: assignment.dueDate,
          expiredAt: assignment.expiredAt,    // ✅ NOW HAS VALUE
          points: slotPoints,
          timeSlot: {
            id: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            label: slot.label,
            points: slot.points
          },
          notes: assignment.notes,
          slotId: slot.id,
          slotTime: `${slot.startTime}-${slot.endTime}`,
          slotLabel: slot.label || '',
          missedSlotIds: [slot.id],
          missedSlotsCount: 1,
          daysAgo: assignment.expiredAt 
            ? Math.floor((new Date().getTime() - new Date(assignment.expiredAt).getTime()) / (1000 * 60 * 60 * 24))
            : 0
        };
      });
    });

    console.log(`\n📊 ========== getGroupNeglectedTasks SUMMARY ==========`);
    console.log(`   Original assignments: ${neglectedTasks.length}`);
    console.log(`   Individual slot entries: ${formattedTasks.length}`);
    formattedTasks.forEach((task, idx) => {
      console.log(`   ${idx + 1}. ${task.user?.fullName} - ${task.taskTitle} - Slot: ${task.timeSlot?.startTime}-${task.timeSlot?.endTime} - Points: ${task.points} - Expired: ${task.expiredAt}`);
    });
    console.log(`   Points by user:`, pointsByUser);
    
    console.log(`==================================================\n`);

    return {
      success: true,
      message: "Group neglected tasks retrieved",
      data: {
        tasks: formattedTasks,
        total: formattedTasks.length,
        count: formattedTasks.length, 
        pointsByUser
      }
    };

  } catch (error: any) {
    console.error("Error getting group neglected tasks:", error);
    return { success: false, message: error.message };
  }
}

static async getUpcomingAssignments(
  userId: string,
  filters?: {
    groupId?: string;
    limit?: number;
  }
) {
  try {
    const where: any = {
      userId: userId,
      completed: false,
      expired: false,
      OR: [
        { partiallyExpired: false },
        { partiallyExpired: null }
      ]
    };

    if (filters?.groupId) {
      where.task = {
        groupId: filters.groupId
      };
    }

    const assignments = await prisma.assignment.findMany({
      where,
      include: {
        timeSlot: true,
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
        }
      },
      orderBy: { dueDate: 'asc' },
      take: filters?.limit || 10
    });

    const validAssignments = assignments.filter(a => a.task !== null);
    
    // ✅ FIXED: Use UTC for date comparison
    const { todayUTC } = AssignmentService.getUTCToday();

    const formattedAssignments = validAssignments.map(assignment => {
      const completedSlotIds = (assignment as any).completedTimeSlotIds || [];
      const missedSlotIds = (assignment as any).missedTimeSlotIds || [];
      
      let isStillActive = true;
      
      if (assignment.task?.executionFrequency === 'DAILY' && assignment.task?.timeSlots?.length > 1) {
        const dueDate = new Date(assignment.dueDate);
        
        // ✅ FIXED: Use UTC comparison
        if (dueDate < todayUTC) {
          const remainingSlots = assignment.task.timeSlots.filter((slot: any) => 
            !completedSlotIds.includes(slot.id) && !missedSlotIds.includes(slot.id)
          );
          isStillActive = remainingSlots.length > 0;
        }
      }
      
      return {
        id: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task!.title,
        taskPoints: assignment.points,
        group: assignment.task!.group,
        dueDate: assignment.dueDate,
        timeSlot: assignment.timeSlot,
        rotationWeek: assignment.rotationWeek,
        completed: assignment.completed,
        expired: assignment.expired,
        partiallyExpired: assignment.partiallyExpired,
        isStillActive,
        missedTimeSlotIds: missedSlotIds,
        completedTimeSlotIds: completedSlotIds,
        timeSlots: assignment.task!.timeSlots || []
      };
    });

    return {
      success: true,
      message: "Upcoming assignments retrieved",
      data: {
        assignments: formattedAssignments,
        currentTime: new Date(),
        total: formattedAssignments.length
      }
    };

  } catch (error: any) {
    console.error("AssignmentService.getUpcomingAssignments error:", error);
    return {
      success: false,
      message: error.message,
      data: {
        assignments: [],
        currentTime: new Date(),
        total: 0
      }
    };
  }
}

// services/assignment.services.ts - COMPLETE FIX for multi-slot

static async getTodayAssignments(
  userId: string,
  filters?: {
    groupId?: string;
  }
) {
  try {
    console.log('🔍🔍🔍 [getTodayAssignments] START 🔍🔍🔍');
    console.log(`👤 User ID: ${userId}`);
    console.log(`🎯 Group filter:`, filters?.groupId || 'none');
    
    const now = new Date();
    
    const { todayUTC, tomorrowUTC } = AssignmentService.getUTCToday();
    
    console.log(`📅 Today UTC: ${todayUTC.toISOString()}`);
    console.log(`📅 Tomorrow UTC: ${tomorrowUTC.toISOString()}`);
    
    const userAssignmentsResult = await this.getUserAssignments(userId, {
      limit: 100,
      offset: 0
    });
    
    if (!userAssignmentsResult.success) {
      return {
        success: false,
        data: { assignments: [], currentTime: now, total: 0 },
        message: userAssignmentsResult.message
      };
    }
    
    const allAssignments = userAssignmentsResult.assignments || [];
    
    const todayAssignments = allAssignments.filter((assignment: any) => {
      // ✅ Skip completed assignments
      if (assignment.completed) {
        console.log(`⏭️ Skipping COMPLETED assignment: ${assignment.taskTitle} (${assignment.id})`);
        return false;
      }
      
      // ✅ Skip verified assignments
      if (assignment.verified === true) {
        console.log(`⏭️ Skipping VERIFIED assignment: ${assignment.taskTitle} (${assignment.id})`);
        return false;
      }
      
      // ✅ Skip expired assignments
      if (assignment.expired === true) {
        console.log(`⏭️ Skipping EXPIRED assignment: ${assignment.taskTitle} (${assignment.id})`);
        return false;
      }
      
      // ✅ CRITICAL: For multi-slot tasks, check if THIS SPECIFIC SLOT is already completed
      const completedSlotIds = assignment.completedTimeSlotIds || [];
      const currentTimeSlotId = assignment.timeSlot?.id;
      
      if (currentTimeSlotId && completedSlotIds.includes(currentTimeSlotId)) {
        console.log(`⏭️ Skipping - time slot ${assignment.timeSlot?.startTime}-${assignment.timeSlot?.endTime} already completed: ${assignment.taskTitle}`);
        return false;
      }
      
      // ✅ Skip if this specific slot has already been submitted (has photo)
      // For multi-slot tasks, each submission has its own photo
      if (assignment.photoUrl !== null && assignment.photoUrl !== undefined) {
        // Check if this photo is for the current slot (multi-slot)
        const photoSlotId = assignment.photoSlotId; // You may need to add this field
        if (!photoSlotId || photoSlotId === currentTimeSlotId) {
          console.log(`⏭️ Skipping - this slot already has a submission (pending verification): ${assignment.taskTitle}`);
          return false;
        }
      }
      
      // ✅ Check partially expired - but only for REMAINING slots
      if (assignment.partiallyExpired === true) {
        const remainingSlots = assignment.timeSlots?.filter((slot: any) => 
          !assignment.completedTimeSlotIds?.includes(slot.id) && 
          !assignment.missedTimeSlotIds?.includes(slot.id)
        );
        
        // If current slot is not in remaining slots, skip
        if (currentTimeSlotId && !remainingSlots?.some((s: any) => s.id === currentTimeSlotId)) {
          console.log(`⏭️ Skipping - slot ${assignment.timeSlot?.startTime} not in remaining slots: ${assignment.taskTitle}`);
          return false;
        }
        
        if (!remainingSlots || remainingSlots.length === 0) {
          console.log(`⏭️ Skipping PARTIALLY EXPIRED with no remaining slots: ${assignment.taskTitle}`);
          return false;
        }
      }
      
      if (!assignment.dueDate) {
        console.log(`⏭️ Skipping assignment without due date: ${assignment.taskTitle}`);
        return false;
      }
      
      const dueDate = new Date(assignment.dueDate);
      const isDueToday = dueDate >= todayUTC && dueDate < tomorrowUTC;
      
      const belongsToGroup = !filters?.groupId || assignment.group?.id === filters.groupId;
      
      if (isDueToday) {
        const isSlotCompleted = currentTimeSlotId && completedSlotIds.includes(currentTimeSlotId);
        console.log(`✅ Assignment due today: ${assignment.taskTitle}`);
        console.log(`   Current slot: ${assignment.timeSlot?.startTime}-${assignment.timeSlot?.endTime}`);
        console.log(`   Slot completed? ${isSlotCompleted ? 'YES (skipping)' : 'NO'}`);
        console.log(`   Has photo? ${assignment.photoUrl ? 'YES' : 'NO'}`);
      }
      
      return isDueToday && belongsToGroup;
    });
    
    console.log(`📋 Found ${todayAssignments.length} active pending assignments due today`);
    
    const assignmentsWithTimeInfo = todayAssignments.map((assignment: any) => {
      // ✅ For already submitted slots, use stored points directly
      const completedSlotIds = assignment.completedTimeSlotIds || [];
      const currentTimeSlotId = assignment.timeSlot?.id;
      const isSlotCompleted = currentTimeSlotId && completedSlotIds.includes(currentTimeSlotId);
      
      if (isSlotCompleted || assignment.photoUrl) {
        console.log(`📸 Slot already submitted: ${assignment.taskTitle} - ${assignment.timeSlot?.startTime} - Points: ${assignment.points}`);
        return {
          id: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.taskTitle,
          taskPoints: assignment.points,
          group: assignment.group,
          dueDate: assignment.dueDate,
          canSubmit: false,
          timeLeft: null,
          timeLeftText: null,
          reason: 'Already submitted',
          timeSlot: assignment.timeSlot,
          willBePenalized: false,
          finalPoints: assignment.points,
          submissionStatus: 'completed',
          completed: assignment.completed,
          verified: assignment.verified,
          expired: assignment.expired,
          photoUrl: assignment.photoUrl,
          partiallyExpired: assignment.partiallyExpired,
          completedTimeSlotIds: assignment.completedTimeSlotIds,
          missedTimeSlotIds: assignment.missedTimeSlotIds,
          timeSlots: assignment.timeSlots
        };
      }
      
      // For non-submitted slots, calculate time info
      const assignmentForValidation = {
        ...assignment,
        timeSlot: assignment.timeSlot,
        points: assignment.points,
        dueDate: assignment.dueDate
      };
      
      const validation = TimeHelpers.canSubmitAssignment(assignmentForValidation, now);
      
      // ✅ For multi-slot tasks, the points might already be partially calculated
      let finalPointsToShow = validation.finalPoints;
      
      // If this is a multi-slot task and some slots are already completed,
      // the stored points should reflect completed slots only
      if (assignment.timeSlots?.length > 1 && assignment.points) {
        // Calculate points from already completed slots
        const completedPoints = assignment.timeSlots
          .filter((slot: any) => completedSlotIds.includes(slot.id))
          .reduce((sum: number, slot: any) => sum + (slot.points || 0), 0);
        
        // Add potential points for current slot if submitted now
        const currentSlotPoints = assignment.timeSlot?.points || assignment.taskPoints || 0;
        const potentialTotal = completedPoints + (validation.willBePenalized ? Math.floor(currentSlotPoints * 0.5) : currentSlotPoints);
        
        finalPointsToShow = potentialTotal;
      }
      
      return {
        id: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.taskTitle,
        taskPoints: assignment.points || assignment.taskPoints,
        group: assignment.group,
        dueDate: assignment.dueDate,
        canSubmit: validation.allowed,
        timeLeft: validation.timeLeft,
        timeLeftText: validation.timeLeft ? TimeHelpers.getTimeLeftText(validation.timeLeft) : null,
        reason: validation.reason,
        timeSlot: assignment.timeSlot,
        willBePenalized: validation.willBePenalized,
        finalPoints: finalPointsToShow,
        submissionStatus: validation.submissionStatus,
        completed: assignment.completed,
        verified: assignment.verified,
        expired: assignment.expired,
        photoUrl: assignment.photoUrl,
        partiallyExpired: assignment.partiallyExpired,
        completedTimeSlotIds: assignment.completedTimeSlotIds,
        missedTimeSlotIds: assignment.missedTimeSlotIds,
        timeSlots: assignment.timeSlots
      };
    });
    
    console.log(`✅ Final active pending assignments count: ${assignmentsWithTimeInfo.length}`);
    
    // ✅ Log multi-slot details for debugging
    assignmentsWithTimeInfo.forEach((assignment: any) => {
      if (assignment.timeSlots?.length > 1) {
        console.log(`📊 Multi-slot task: ${assignment.taskTitle}`);
        console.log(`   Completed slots: ${assignment.completedTimeSlotIds?.length || 0}/${assignment.timeSlots.length}`);
        console.log(`   Current slot: ${assignment.timeSlot?.startTime}-${assignment.timeSlot?.endTime}`);
        console.log(`   Points: ${assignment.finalPoints}`);
      }
    });
    
    return {
      success: true,
      message: "Today's active pending assignments retrieved",
      data: {
        assignments: assignmentsWithTimeInfo,
        currentTime: now,
        total: assignmentsWithTimeInfo.length
      }
    };
    
  } catch (error: any) {
    console.error('❌❌❌ [getTodayAssignments] ERROR ❌❌❌');
    console.error(error);
    return {
      success: false,
      message: error.message || "Error retrieving today's assignments",
      data: {
        assignments: [],
        currentTime: new Date(),
        total: 0
      }  
    };
  }
}

static async getUserAssignments( 
  userId: string,
  filters: {
    status?: string;
    week?: number;
    limit: number;
    offset: number;
  }
) {
  try { 
    console.log('🔍🔍🔍 [getUserAssignments] START 🔍🔍🔍');
    console.log(`👤 User ID: ${userId}`);
    console.log(`📋 Filters:`, filters);
    
    const where: any = { 
      userId,
      taskId: { not: null }
    };
    
    if (filters.status) {
      switch (filters.status) {
        case 'pending':
          where.completed = false;
          where.expired = false;
          where.OR = [
            { partiallyExpired: false },
            { partiallyExpired: null }
          ];
          break;
        case 'pending_verification':
          where.photoUrl = { not: null };
          where.verified = null;
          where.completed = false;
          break;
        case 'completed':
          where.completed = true;
          where.verified = null;
          break;
        case 'verified':
          where.completed = true;
          where.verified = true;
          break;
        case 'rejected':
          where.completed = true;
          where.verified = false;
          break;
      }
    }

    if (filters.week !== undefined) {
      where.rotationWeek = filters.week;
    }

    const { todayUTC, tomorrowUTC } = AssignmentService.getUTCToday();

    const [assignments, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
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
              group: { select: { id: true, name: true } }
            }
          },
          timeSlot: true
        },
        orderBy: { dueDate: 'asc' },
        take: filters.limit,
        skip: filters.offset
      }),
      prisma.assignment.count({ where })
    ]);

    const validAssignments = assignments.filter(a => a.task !== null);
    
    // ✅ Calculate total possible points for this user
    let totalPossiblePoints = 0;
    for (const a of validAssignments) {
      const task = a.task;
      if (task) {
        if (task.timeSlots && task.timeSlots.length > 1) {
          // Points per slot (assignment-based)
          const pointsPerSlot = task.points / task.timeSlots.length;
          totalPossiblePoints += pointsPerSlot;
        } else {
          totalPossiblePoints += (task.points || 0);
        }
      }
    }
    
    // ✅ Calculate earned points
    const earnedPoints = validAssignments
      .filter(a => a.verified === true)
      .reduce((sum, a) => sum + (a.points || 0), 0);
    
    console.log(`📊 [getUserAssignments] Points summary for user ${userId}:`, {
      totalAssignments: validAssignments.length,
      totalPossiblePoints,
      earnedPoints,
      completionRate: totalPossiblePoints > 0 ? Math.round((earnedPoints / totalPossiblePoints) * 100) : 0
    });
    
    const formattedAssignments = validAssignments.map(assignment => {
      const verificationStatus = AssignmentHelpers.getVerificationStatus(assignment);
      const timeUntilDue = AssignmentHelpers.getTimeUntilDue(assignment.dueDate);
      
      const completedSlotIds = (assignment as any).completedTimeSlotIds || [];
      const missedSlotIds = (assignment as any).missedTimeSlotIds || [];
      
      return {
        id: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task!.title,
        task: {
          id: assignment.task!.id,
          title: assignment.task!.title,
          points: assignment.task!.points,
          executionFrequency: assignment.task!.executionFrequency,
          timeSlots: assignment.task!.timeSlots || []
        },
        group: assignment.task!.group,
        points: assignment.points,
        completed: assignment.completed,
        verified: assignment.verified,
        verificationStatus,
        photoUrl: assignment.photoUrl,
        notes: assignment.notes,
        adminNotes: assignment.adminNotes,
        dueDate: assignment.dueDate,
        completedAt: assignment.completedAt,
        timeUntilDue,
        timeSlot: assignment.timeSlot,
        rotationWeek: assignment.rotationWeek,
        isDueToday: assignment.dueDate >= todayUTC && assignment.dueDate < tomorrowUTC,
        isHistorical: false,
        expired: assignment.expired || false,
        partiallyExpired: assignment.partiallyExpired || false,
        missedTimeSlotIds: missedSlotIds,
        completedTimeSlotIds: completedSlotIds,
        timeSlots: assignment.task!.timeSlots || []
      };
    });

    const historicalWhere: any = {
      userId,
      taskId: null,
      taskTitle: { not: null },
      ...(filters.week !== undefined ? { rotationWeek: filters.week } : {})
    };

    const historicalAssignments = await prisma.assignment.findMany({
      where: historicalWhere,
      include: {
        timeSlot: true
      },
      orderBy: { dueDate: 'asc' }
    });

    const formattedHistorical = historicalAssignments.map(assignment => ({
      id: assignment.id,
      taskId: null,
      taskTitle: assignment.taskTitle || "Deleted Task",
      group: { id: '', name: 'Deleted Group' },
      points: assignment.taskPoints || assignment.points,
      completed: assignment.completed,
      verified: assignment.verified,
      verificationStatus: assignment.verified ? 'verified' : (assignment.completed ? 'pending' : 'incomplete'),
      photoUrl: assignment.photoUrl,
      notes: assignment.notes,
      adminNotes: assignment.adminNotes,
      dueDate: assignment.dueDate,
      completedAt: assignment.completedAt,
      timeUntilDue: AssignmentHelpers.getTimeUntilDue(assignment.dueDate),
      timeSlot: assignment.timeSlot,
      rotationWeek: assignment.rotationWeek,
      isDueToday: false,
      isHistorical: true,
      expired: false,
      partiallyExpired: false,
      missedTimeSlotIds: [],
      completedTimeSlotIds: [],
      timeSlots: []
    })); 

    const allAssignments = [...formattedAssignments, ...formattedHistorical];

    return {
      success: true,
      message: "Assignments retrieved successfully",
      assignments: allAssignments,
      total: validAssignments.length + historicalAssignments.length,
      totalPossiblePoints,  // ✅ ADD THIS
      earnedPoints,         // ✅ ADD THIS
      filters,
      currentDate: { today: todayUTC, tomorrow: tomorrowUTC }
    };

  } catch (error: any) {
    console.error('❌❌❌ [getUserAssignments] ERROR ❌❌❌');
    console.error(error);
    return { success: false, message: error.message || "Error retrieving assignments" };
  }
}

private static isTimeSlotNeglected(assignment: any, timeSlot: any, now: Date): boolean {
  if (assignment.completed) return false;
  if (assignment.photoUrl) return false;  // Has submission, don't mark as neglected

  // Already tracked as missed — skip
  const existingMissedSlotIds: string[] = Array.isArray(assignment.missedTimeSlotIds)
    ? assignment.missedTimeSlotIds
    : [];
  if (existingMissedSlotIds.includes(timeSlot.id)) return false;

  // Already tracked as completed — skip
  const existingCompletedSlotIds: string[] = Array.isArray(assignment.completedTimeSlotIds)
    ? assignment.completedTimeSlotIds
    : [];
  if (existingCompletedSlotIds.includes(timeSlot.id)) return false;

  const dueDate = new Date(assignment.dueDate);
  
  // Only check assignments due TODAY (in UTC)
  const dueDateUTC = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  if (dueDateUTC !== todayUTC) return false;

  // ✅ FIXED: Get due date components for correct date construction
  const dueYear = dueDate.getUTCFullYear();
  const dueMonth = dueDate.getUTCMonth();
  const dueDay = dueDate.getUTCDate();

  // Parse end time (stored in PHT / UTC+8) → convert to UTC
  let endHour = parseInt(timeSlot.endTime.split(':')[0]);
  const endMin = parseInt(timeSlot.endTime.split(':')[1]);

  // PHT (UTC+8) to UTC
  endHour = endHour - 8;
  if (endHour < 0) endHour += 24;

  // ✅ FIXED: Create UTC date using due date's date components
  const endTimeUTC = new Date(Date.UTC(dueYear, dueMonth, dueDay, endHour, endMin, 0, 0));
  const gracePeriodEnd = new Date(endTimeUTC.getTime() + 30 * 60000);

  // Mark as neglected ONLY AFTER grace period ends
  const isNeglected = now > gracePeriodEnd;
  
  console.log(`   ⏰ Slot ${timeSlot.startTime}-${timeSlot.endTime}:`);
  console.log(`      endTimeUTC=${endTimeUTC.toISOString()}`);
  console.log(`      gracePeriodEnd=${gracePeriodEnd.toISOString()}`);
  console.log(`      now=${now.toISOString()}`);
  console.log(`      isNeglected=${isNeglected}`);
  if (!isNeglected && now < gracePeriodEnd) {
    const timeRemaining = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / 1000);
    console.log(`      Time remaining in grace period: ${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s`);
  }
  
  return isNeglected;
}


private static isSingleSlotNeglected(assignment: any, now: Date): boolean {
  if (assignment.completed) return false;
  if (assignment.photoUrl) return false;
  if (assignment.expired) return false;
  
  const dueDate = new Date(assignment.dueDate);
  
  const dueDateUTC = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  
  if (dueDateUTC !== todayUTC) return false;
  
  if (!assignment.timeSlot) {
    const endOfDayUTC = new Date(dueDate);
    endOfDayUTC.setUTCHours(23, 59, 59, 999);
    const gracePeriodEnd = new Date(endOfDayUTC.getTime() + 30 * 60000);
    // ✅ NO BUFFER - exactly 30 minutes grace period
    return now > gracePeriodEnd;
  }
  
  const [endHourRaw, endMinRaw] = assignment.timeSlot.endTime.split(':');
  let endHour = parseInt(endHourRaw || '0', 10);
  const endMin = parseInt(endMinRaw || '0', 10);
  
  endHour = endHour - 8;
  if (endHour < 0) endHour += 24;
  
  const endTimeUTC = new Date(dueDate);
  endTimeUTC.setUTCHours(endHour, endMin, 0, 0);
  
  // ✅ NO BUFFER - exactly 30 minutes grace period
  const gracePeriodEnd = new Date(endTimeUTC.getTime() + 30 * 60000);
  
  const isNeglected = now > gracePeriodEnd;
  
  console.log(`   ⏰ Single slot check: endTime=${endTimeUTC.toISOString()}, graceEnd=${gracePeriodEnd.toISOString()}, now=${now.toISOString()}, isNeglected=${isNeglected}`);
  
  return isNeglected;
}

// In assignment.services.ts - COMPLETELY FIXED checkGroupNeglectedAssignments with NO DUPLICATES & SLOT EXPIRY TRACKING

private static async checkGroupNeglectedAssignments(groupId: string) {
  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { currentRotationWeek: true }
    });

    if (!group) return { count: 0, pointsNotAwarded: 0 };

    const now = new Date();
    const { todayUTC } = AssignmentService.getUTCToday();

    // Get ALL assignments for current week
    const assignments = await prisma.assignment.findMany({
      where: {
        task: { groupId },
        rotationWeek: group.currentRotationWeek,
        completed: false,
        AND: [
          {
            OR: [
              { verified: false },
              { verified: null }
            ]
          }
        ]
      },
      include: {
        user: {
          select: { id: true, fullName: true, avatarUrl: true }
        },
        task: {
          select: {
            id: true,
            title: true,
            groupId: true
          }
        },
        timeSlot: {
          select: { id: true, startTime: true, endTime: true, label: true, points: true }
        }
      }
    });

    const validAssignments = assignments.filter(a => a.task !== null);
    if (validAssignments.length === 0) return { count: 0, pointsNotAwarded: 0 };

    console.log(`\n📊 ========== CHECKING NEGLECTED ASSIGNMENTS for group ${groupId} ==========`);
    console.log(`📊 Found ${validAssignments.length} assignments to check`);
    console.log(`⏱️ Current time (UTC): ${now.toISOString()}\n`);

    let neglectedCount = 0;
    let totalPointsNotAwarded = 0;

    const admins = await prisma.groupMember.findMany({
      where: { groupId, groupRole: "ADMIN", isActive: true },
      select: { userId: true, user: { select: { fullName: true } } }
    });

    for (const assignment of validAssignments) {
      console.log(`\n🔍 ========== CHECKING ASSIGNMENT ==========`);
      console.log(`   Task: ${assignment.task!.title}`);
      console.log(`   ID: ${assignment.id}`);
      console.log(`   User: ${assignment.user?.fullName}`);
      console.log(`   Due date (UTC): ${assignment.dueDate.toISOString()}`);
      
      // SKIP if assignment has a photo
      if (assignment.photoUrl) {
        console.log(`   ⏭️ SKIPPING - Assignment has photo (pending verification)`);
        continue;
      }
      
      // ONLY check assignments due TODAY
      const dueDateObj = new Date(assignment.dueDate);
      const dueDateUTC = Date.UTC(
        dueDateObj.getUTCFullYear(),
        dueDateObj.getUTCMonth(),
        dueDateObj.getUTCDate()
      );
      
      if (dueDateUTC !== todayUTC.getTime()) {
        console.log(`   ⏭️ SKIPPING - Not due today (due: ${dueDateObj.toISOString().split('T')[0]})`);
        continue;
      }
      
      // Get current state from database
      const freshAssignment = await prisma.assignment.findUnique({
        where: { id: assignment.id },
        select: { 
          completedTimeSlotIds: true,
          missedTimeSlotIds: true,
          slotExpiredAt: true,  // ✅ Get stored expiry times
          photoUrl: true,
          points: true,
          expired: true,
          partiallyExpired: true
        }
      });
      
      if (freshAssignment?.photoUrl) {
        console.log(`   ⏭️ SKIPPING - Assignment now has photo`);
        continue;
      }
      
      // Parse existing completed and missed slots
      let completedSlotIds: string[] = [];
      const completedRaw = freshAssignment?.completedTimeSlotIds;
      if (completedRaw) {
        if (typeof completedRaw === 'string') {
          try { 
            const parsed = JSON.parse(completedRaw);
            completedSlotIds = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
          } catch(e) { completedSlotIds = []; }
        } else if (Array.isArray(completedRaw)) {
          completedSlotIds = completedRaw.filter((item): item is string => typeof item === 'string');
        }
      }
      
      let existingMissedSlotIds: string[] = [];
      const missedRaw = freshAssignment?.missedTimeSlotIds;
      if (missedRaw) {
        if (typeof missedRaw === 'string') {
          try { 
            const parsed = JSON.parse(missedRaw);
            existingMissedSlotIds = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
          } catch(e) { existingMissedSlotIds = []; }
        } else if (Array.isArray(missedRaw)) {
          existingMissedSlotIds = missedRaw.filter((item): item is string => typeof item === 'string');
        }
      }
      
      let slotExpiredAt: Record<string, Date> = {};
const expiryRaw = freshAssignment?.slotExpiredAt;
if (expiryRaw) {
  if (typeof expiryRaw === 'string') {
    try {
      const parsed = JSON.parse(expiryRaw);
      if (parsed && typeof parsed === 'object') {
        // Convert each value to Date if it's a string
        slotExpiredAt = Object.entries(parsed).reduce((acc, [key, value]) => {
          acc[key] = typeof value === 'string' ? new Date(value) : new Date();
          return acc;
        }, {} as Record<string, Date>);
      }
    } catch(e) {
      slotExpiredAt = {};
    }
  } else if (typeof expiryRaw === 'object' && expiryRaw !== null) {
    // Handle Prisma JsonValue object
    const obj = expiryRaw as any;
    slotExpiredAt = Object.keys(obj).reduce((acc, key) => {
      const value = obj[key];
      acc[key] = typeof value === 'string' ? new Date(value) : 
                  value instanceof Date ? value : new Date();
      return acc;
    }, {} as Record<string, Date>);
  }
}
   
      console.log(`   📊 Existing completed slots: ${completedSlotIds.length}`);
      console.log(`   📊 Existing missed slots: ${existingMissedSlotIds.length}`);
      
      // ✅ FETCH FRESH TIME SLOTS DIRECTLY FROM DATABASE
      const freshTimeSlots = await prisma.timeSlot.findMany({
        where: { taskId: assignment.taskId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, startTime: true, endTime: true, label: true, points: true }
      });
      
      const isMultiSlot = freshTimeSlots.length > 1;
      
      // ========== MULTI-SLOT TASK ==========
      if (isMultiSlot) {
        const dueYear = dueDateObj.getUTCFullYear();
        const dueMonth = dueDateObj.getUTCMonth();
        const dueDay = dueDateObj.getUTCDate();
        
        console.log(`   📋 Fresh time slots from DB:`);
        freshTimeSlots.forEach(slot => {
          console.log(`      ${slot.startTime}-${slot.endTime} (${slot.id})`);
        });
        
        const newlyMissedSlots: any[] = [];
        
        for (const slot of freshTimeSlots) {
          // Skip if already completed
          if (completedSlotIds.includes(slot.id)) {
            console.log(`   ✅ Slot ${slot.startTime}-${slot.endTime} already COMPLETED - skipping`);
            continue;
          }
          
          // ✅ Skip if already missed (prevents duplicates)
          if (existingMissedSlotIds.includes(slot.id)) {
            console.log(`   ⚠️ Slot ${slot.startTime}-${slot.endTime} already MISSED - skipping duplicate`);
            continue;
          }
          
          const endTimeStr = slot.endTime;
          if (!endTimeStr) continue;
          
          const endTimeParts = endTimeStr.split(':');
          if (endTimeParts.length < 2) continue;
          
          let endHour = parseInt(endTimeParts[0] || '0', 10);
          const endMin = parseInt(endTimeParts[1] || '0', 10);
          
          if (isNaN(endHour) || isNaN(endMin)) continue;
          
          console.log(`   📍 Slot ${slot.startTime}-${slot.endTime}: endHour=${endHour}, endMin=${endMin}`);
          
          // PHT (UTC+8) to UTC
          let endHourUTC = endHour - 8;
          if (endHourUTC < 0) endHourUTC += 24;
          
          const slotEndTimeUTC = new Date(Date.UTC(dueYear, dueMonth, dueDay, endHourUTC, endMin, 0, 0));
          const graceEnd = new Date(slotEndTimeUTC.getTime() + 30 * 60000);
          
          console.log(`   ⏰ Checking slot ${slot.startTime}-${slot.endTime}:`);
          console.log(`      End UTC: ${slotEndTimeUTC.toISOString()}`);
          console.log(`      Grace ends: ${graceEnd.toISOString()}`);
          console.log(`      Current: ${now.toISOString()}`);
          
          if (now > graceEnd) {
            console.log(`      ❌ Slot ${slot.startTime}-${slot.endTime} is NEGLECTED!`);
            newlyMissedSlots.push({
              ...slot,
              expiredAt: graceEnd  // ✅ Store when this slot expired
            });
          } else {
            const timeRemaining = Math.ceil((graceEnd.getTime() - now.getTime()) / 1000);
            console.log(`      ⏰ Still in grace period (ends in ${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s)`);
          }
        }
        
        if (newlyMissedSlots.length === 0) {
          console.log(`   ✅ No newly missed slots for this assignment`);
          continue;
        }
        
        // ✅ FILTER OUT DUPLICATES - only add slots not already missed
        const uniqueNewSlots = newlyMissedSlots.filter(slot => !existingMissedSlotIds.includes(slot.id));
        
        if (uniqueNewSlots.length === 0) {
          console.log(`   ⚠️ All newly missed slots were already missed - skipping duplicate update`);
          continue;
        }
        
        console.log(`   📊 Found ${uniqueNewSlots.length} UNIQUE new missed slot(s) (filtered from ${newlyMissedSlots.length})`);
        
        const updatedMissedIds = [...existingMissedSlotIds, ...uniqueNewSlots.map(s => s.id)];
        
        // ✅ Update slot expiry times
        const updatedSlotExpiry = { ...slotExpiredAt };
        for (const slot of uniqueNewSlots) {
          updatedSlotExpiry[slot.id] = slot.expiredAt;
        }
        
        const allSlotIds = freshTimeSlots.map(s => s.id);
        const allSlotsAccounted = allSlotIds.every(
          id => updatedMissedIds.includes(id) || completedSlotIds.includes(id)
        );
        const allSlotsMissed = allSlotIds.every(id => updatedMissedIds.includes(id));
        
        let newlyLostPoints = 0;
        for (const slot of uniqueNewSlots) {
          newlyLostPoints += slot.points || 0;
        }
        totalPointsNotAwarded += newlyLostPoints;
        
        const currentMember = await prisma.groupMember.findFirst({
          where: { userId: assignment.userId, groupId, isActive: true },
          select: { cumulativePoints: true }
        });
        let currentPoints = currentMember?.cumulativePoints || 0;
        
        let totalDeduction = 0;
        let tempPoints = currentPoints;
        for (const slot of uniqueNewSlots) {
          const slotPts = slot.points || 0;
          const deduction = Math.min(slotPts, tempPoints);
          if (deduction > 0) {
            tempPoints -= deduction;
            totalDeduction += deduction;
          }
        }
        
        if (totalDeduction > 0) {
          await prisma.groupMember.updateMany({
            where: { userId: assignment.userId, groupId, isActive: true },
            data: {
              cumulativePoints: { decrement: totalDeduction },
              pointsUpdatedAt: new Date()
            }
          });
          console.log(`💰 [POINTS DEDUCTED] -${totalDeduction}`);
        }
        
        // ✅ Update assignment with missed slots and their expiry times
        await prisma.assignment.update({
          where: { id: assignment.id },
          data: {
            missedTimeSlotIds: updatedMissedIds,
            slotExpiredAt: updatedSlotExpiry as any,  // ✅ Store when each slot expired
            points: Math.max(0, (currentPoints - totalDeduction)),
            partiallyExpired: !allSlotsMissed && updatedMissedIds.length > 0,
            expired: allSlotsMissed,
            expiredAt: allSlotsMissed ? now : undefined
          }
        });
        
        neglectedCount += uniqueNewSlots.length;
        
        for (const slot of uniqueNewSlots) {
          const slotPointsLost = Math.min(slot.points || 0, currentPoints);
          currentPoints -= slotPointsLost;
          
          await UserNotificationService.createNotification({
            userId: assignment.userId,
            type: "SLOT_MISSED",
            title: "⏰ Time Slot Missed",
            message: `You missed the ${slot.startTime}-${slot.endTime} slot for "${assignment.task!.title}". ${slotPointsLost > 0 ? `Lost ${slotPointsLost} points.` : 'No points deducted.'}`,
            data: {
              assignmentId: assignment.id,
              taskId: assignment.taskId,
              taskTitle: assignment.task!.title,
              groupId,
              slotId: slot.id,
              slotTime: `${slot.startTime}-${slot.endTime}`,
              slotLabel: slot.label || '',
              pointsLost: slotPointsLost,
              expiredAt: slot.expiredAt.toISOString(),
              dueDate: assignment.dueDate.toISOString(),
              detectedAt: now.toISOString()
            }
          });
          
          for (const admin of admins) {
            await UserNotificationService.createNotification({
              userId: admin.userId,
              type: "NEGLECT_DETECTED",
              title: "⚠️ Time Slot Missed",
              message: `${assignment.user?.fullName || 'Unknown'} missed the ${slot.startTime}-${slot.endTime} slot for "${assignment.task!.title}"`,
              data: {
                assignmentId: assignment.id,
                taskId: assignment.taskId,
                taskTitle: assignment.task!.title,
                groupId,
                userId: assignment.userId,
                userName: assignment.user?.fullName || 'Unknown',
                pointsLost: slotPointsLost,
                slotId: slot.id,
                slotTime: `${slot.startTime}-${slot.endTime}`,
                expiredAt: slot.expiredAt.toISOString(),
                dueDate: assignment.dueDate.toISOString(),
                detectedAt: now.toISOString()
              }
            });
          }
        }
      }
    }

    console.log(`\n📊 ========== NEGLECT DETECTION SUMMARY ==========`);
    console.log(`   Total newly neglected slots: ${neglectedCount}`);
    console.log(`   Total points not awarded: ${totalPointsNotAwarded}`);
    console.log(`==================================================\n`);
    
    return { count: neglectedCount, pointsNotAwarded: totalPointsNotAwarded };

  } catch (error) {
    console.error("AssignmentService.checkGroupNeglectedAssignments error:", error);
    return { count: 0, pointsNotAwarded: 0 };
  }
}

static async sendUpcomingTaskReminders() {
  try {
    const processedSlots = new Set<string>();
    const now = new Date();
    const phtTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const currentInMinutes = phtTime.getHours() * 60 + phtTime.getMinutes();
    const { todayUTC, tomorrowUTC } = AssignmentService.getUTCToday();
    
    console.log(`\n⏰ ========== [sendUpcomingTaskReminders] ==========`);
    console.log(`   Current PHT time: ${phtTime.getHours()}:${phtTime.getMinutes().toString().padStart(2, '0')} (${currentInMinutes} minutes)`);
    console.log(`   Today UTC: ${todayUTC.toISOString()}`);
    
    const assignments = await prisma.assignment.findMany({
      where: {
        completed: false,
        photoUrl: null,
        dueDate: { gte: todayUTC, lt: tomorrowUTC }
      },
      include: {
        user: true,
        task: {
          include: {
            group: true,
            timeSlots: { orderBy: { sortOrder: 'asc' } }
          }
        }
      }
    });
    
    const validAssignments = assignments.filter(a => a.task !== null);
    console.log(`📊 Found ${validAssignments.length} active assignments for today`);
    
    let remindersSent = 0;
    const COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours cooldown per slot
    
    // Fetch recent reminders for this user
    const recentReminders = await prisma.userNotification.findMany({
      where: {
        type: { in: ["TASK_REMINDER", "TASK_ACTIVE"] },
        createdAt: { gte: new Date(Date.now() - COOLDOWN_MS) }
      }
    });
    
    const remindedSlotKeys = new Set<string>();
    for (const reminder of recentReminders) {
      const data = reminder.data as any;
      if (data?.assignmentId && data?.slotId) {
        remindedSlotKeys.add(`${reminder.userId}_${data.assignmentId}_${data.slotId}`);
      }
    }
    
    for (const assignment of validAssignments) {
      // Get fresh completed/missed slots
      const freshAssignment = await prisma.assignment.findUnique({
        where: { id: assignment.id },
        select: { completedTimeSlotIds: true, missedTimeSlotIds: true }
      });
      
      let completedSlotIds: string[] = [];
      const completedRaw = freshAssignment?.completedTimeSlotIds;
      if (completedRaw) {
        if (typeof completedRaw === 'string') {
          try { 
            const parsed = JSON.parse(completedRaw);
            completedSlotIds = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
          } catch(e) { completedSlotIds = []; }
        } else if (Array.isArray(completedRaw)) {
          completedSlotIds = completedRaw.filter((item): item is string => typeof item === 'string');
        }
      }
      
      let missedSlotIds: string[] = [];
      const missedRaw = freshAssignment?.missedTimeSlotIds;
      if (missedRaw) {
        if (typeof missedRaw === 'string') {
          try { 
            const parsed = JSON.parse(missedRaw);
            missedSlotIds = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
          } catch(e) { missedSlotIds = []; }
        } else if (Array.isArray(missedRaw)) {
          missedSlotIds = missedRaw.filter((item): item is string => typeof item === 'string');
        }
      }
      
      console.log(`\n📋 Assignment: ${assignment.task.title} (User: ${assignment.user?.fullName})`);
      
      // ✅ Check EACH slot INDEPENDENTLY
      for (const slot of assignment.task.timeSlots) {
        // Skip already completed or missed slots
        if (completedSlotIds.includes(slot.id)) {
          console.log(`   ⏭️ Slot ${slot.startTime}-${slot.endTime} already COMPLETED`);
          continue;
        }
        if (missedSlotIds.includes(slot.id)) {
          console.log(`   ⏭️ Slot ${slot.startTime}-${slot.endTime} already MISSED`);
          continue;
        }
        
        // Parse times
        const [startHour, startMinute] = slot.startTime.split(':').map(Number);
        const [endHour, endMinute] = slot.endTime.split(':').map(Number);
        
        const startInMinutes = startHour * 60 + startMinute;
        const endInMinutes = endHour * 60 + endMinute;
        const graceEndMins = endInMinutes + 30;
        
        const minutesUntilStart = startInMinutes - currentInMinutes;
        const minutesUntilEnd = endInMinutes - currentInMinutes;
        const timeLeftInGrace = graceEndMins - currentInMinutes;
        
        console.log(`\n   🔍 Slot ${slot.startTime}-${slot.endTime}:`);
        console.log(`      startInMinutes: ${startInMinutes}`);
        console.log(`      endInMinutes: ${endInMinutes}`);
        console.log(`      graceEndMins: ${graceEndMins}`);
        console.log(`      minutesUntilStart: ${minutesUntilStart}`);
        console.log(`      minutesUntilEnd: ${minutesUntilEnd}`);
        console.log(`      timeLeftInGrace: ${timeLeftInGrace}`);
        
        let reminderType: 'upcoming' | 'active' | 'starting' | null = null;
        let reminderTimeLeft = 0;
        
        // ✅ TYPE 1: Starting soon (0-15 minutes before start)
        if (minutesUntilStart > 0 && minutesUntilStart <= 15) {
          reminderType = 'starting';
          reminderTimeLeft = minutesUntilStart;
          console.log(`      → STARTING SOON (starts in ${reminderTimeLeft} min)`);
        }
        // ✅ TYPE 2: Upcoming (15-60 minutes before start)
        else if (minutesUntilStart > 15 && minutesUntilStart <= 60) {
          reminderType = 'upcoming';
          reminderTimeLeft = minutesUntilStart;
          console.log(`      → UPCOMING (starts in ${reminderTimeLeft} min)`);
        }
        // ✅ TYPE 3: Active (during submission window, any time)
        else if (currentInMinutes >= endInMinutes && currentInMinutes <= graceEndMins) {
          reminderType = 'active';
          reminderTimeLeft = timeLeftInGrace;
          const isLate = reminderTimeLeft <= 5;
          console.log(`      → ACTIVE (${reminderTimeLeft} min left in grace period) ${isLate ? '⚠️ LATE WARNING' : ''}`);
        }
        else {
          console.log(`      → No reminder needed`);
        }
        
        if (!reminderType) continue;
        
        // Check if already sent for this slot
        const slotKey = `${assignment.userId}_${assignment.id}_${slot.id}`;
        if (remindedSlotKeys.has(slotKey) || processedSlots.has(slotKey)) {
          console.log(`      ⏭️ Already reminded for this slot (cooldown active)`);
          continue;
        }
        
        processedSlots.add(slotKey);
        
        let title = '';
        let message = '';
        
        if (reminderType === 'starting') {
          title = "🔔 Task Slot Starting Now";
          message = `"${assignment.task.title}" ${slot.label ? `(${slot.label}) ` : ''}slot at ${slot.startTime} starts in ${Math.ceil(reminderTimeLeft)} minute${reminderTimeLeft !== 1 ? 's' : ''}!`;
        } else if (reminderType === 'upcoming') {
          title = "⏰ Task Slot Starting Soon";
          message = `"${assignment.task.title}" ${slot.label ? `(${slot.label}) ` : ''}slot at ${slot.startTime} starts in ${Math.ceil(reminderTimeLeft)} minutes`;
        } else {
          const isLate = reminderTimeLeft <= 5;
          title = isLate ? "⚠️ Submission Window Closing" : "🔔 Ready to Submit";
          message = isLate
            ? `"${assignment.task.title}" ${slot.label ? `(${slot.label}) ` : ''}slot (${slot.startTime}-${slot.endTime}) closing in ${Math.ceil(reminderTimeLeft)} minutes! Points will be reduced.`
            : `"${assignment.task.title}" ${slot.label ? `(${slot.label}) ` : ''}slot (${slot.startTime}-${slot.endTime}) can now be submitted. ${Math.ceil(reminderTimeLeft)} minutes left.`;
        }
        
        await UserNotificationService.createNotification({
          userId: assignment.userId,
          type: reminderType === 'active' ? "TASK_ACTIVE" : "TASK_REMINDER",
          title,
          message,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.task.id,
            taskTitle: assignment.task.title,
            groupId: assignment.task.groupId,
            groupName: assignment.task.group?.name || 'Group',
            slotId: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            label: slot.label,
            points: slot.points,
            minutesUntilStart: reminderType !== 'active' ? reminderTimeLeft : undefined,
            timeLeft: reminderType === 'active' ? reminderTimeLeft : undefined,
            isLate: reminderType === 'active' && reminderTimeLeft <= 5,
            dueDate: assignment.dueDate
          }
        });
        remindersSent++;
        console.log(`      ✅ SENT ${reminderType.toUpperCase()} reminder for slot ${slot.startTime}-${slot.endTime}`);
      }
    }
    
    console.log(`\n📊 ========== REMINDER SUMMARY ==========`);
    console.log(`   Total reminders sent: ${remindersSent}`);
    console.log(`==========================================\n`);
    
    return { success: true, remindersSent };
    
  } catch (error) {
    console.error("sendUpcomingTaskReminders error:", error);
    return { success: false, remindersSent: 0 };
  }
}


private static async markAssignmentAsNeglected(
  assignmentId: string,
  userId: string
) {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        user: { select: { id: true, fullName: true, avatarUrl: true } },
        task: { include: { group: true, timeSlots: true } },
        timeSlot: true
      }
    });

    if (!assignment || assignment.completed) return { success: true, pointsLost: 0 };

    // ✅ FIX: already expired → nothing to do
    if (assignment.expired || assignment.expiredAt !== null) {
      console.log(`⏭️ Assignment ${assignmentId} already expired, skipping`);
      return { success: true, pointsLost: 0, alreadyProcessed: true };
    }

    // ✅ FIX: photo exists → user already submitted, do NOT mark as neglected
    if (assignment.photoUrl) {
      console.log(`⏭️ Assignment ${assignmentId} has a photo (pending verification), skipping neglect`);
      return { success: true, pointsLost: 0, alreadyProcessed: true };
    }

    const assignmentAny = assignment as any;
    const completedSlotIds: string[] = Array.isArray(assignmentAny.completedTimeSlotIds)
      ? assignmentAny.completedTimeSlotIds : [];
    const missedSlotIds: string[] = Array.isArray(assignmentAny.missedTimeSlotIds)
      ? assignmentAny.missedTimeSlotIds : [];

    const now = new Date();
    const pointsLost = assignment.timeSlot?.points || assignment.points || 0;

    const isMultiSlot = assignment.task!.timeSlots && assignment.task!.timeSlots.length > 1;

    if (isMultiSlot) {
      // ✅ FIX: only expire if NO slots completed at all
      if (completedSlotIds.length > 0) {
        console.log(`⏭️ Multi-slot assignment ${assignmentId} has completed slots, not fully expiring`);
        return { success: true, pointsLost: 0, alreadyProcessed: true };
      }
    }

    // ✅ Get current user points
    const currentMember = await prisma.groupMember.findFirst({
      where: { userId: assignment.userId, groupId: assignment.task!.groupId, isActive: true },
      select: { cumulativePoints: true }
    });
    const currentPoints = currentMember?.cumulativePoints || 0;
    
    // ✅ PREVENT NEGATIVE POINTS
    const actualDeduction = Math.min(pointsLost, currentPoints);

    if (actualDeduction > 0) {
      await prisma.groupMember.updateMany({
        where: { userId: assignment.userId, groupId: assignment.task!.groupId, isActive: true },
        data: {
          cumulativePoints: { decrement: actualDeduction },
          pointsUpdatedAt: now
        }
      });
      console.log(`💰 [POINTS DEDUCTED] -${actualDeduction} from ${assignment.userId} (${currentPoints} → ${currentPoints - actualDeduction} pts)`);
    } else {
      console.log(`💰 [POINTS SKIPPED] User ${assignment.userId} has 0 points, no deduction`);
    }

    await prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        expired: true,
        expiredAt: now
      }
    });

    const admins = await prisma.groupMember.findMany({
      where: { groupId: assignment.task!.groupId, groupRole: "ADMIN", isActive: true },
      select: { userId: true, user: { select: { fullName: true } } }
    });

    await UserNotificationService.createNotification({
      userId: assignment.userId,
      type: "TASK_MISSED",
      title: "⚠️ Task Missed",
      message: actualDeduction > 0
        ? `You missed "${assignment.task!.title}" — Lost ${actualDeduction} points`
        : `You missed "${assignment.task!.title}" — You had 0 points, so no points were deducted. Keep going!`,
      data: {
        assignmentId: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task!.title, 
        groupId: assignment.task!.groupId,
        pointsLost: actualDeduction,
        dueDate: assignment.dueDate,
        detectedAt: now
      }
    });

    for (const admin of admins) {
      await UserNotificationService.createNotification({
        userId: admin.userId,
        type: "NEGLECT_DETECTED",
        title: "⚠️ Task Missed Immediately",
        message: `${assignment.user?.fullName || 'Unknown'} missed "${assignment.task!.title}" — ${actualDeduction} pts deducted${actualDeduction === 0 ? ' (user had 0 points)' : ''}`,
        data: {
          assignmentId: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task!.title,
          groupId: assignment.task!.groupId,
          userId: assignment.userId,
          userName: assignment.user?.fullName || 'Unknown',
          pointsLost: actualDeduction,
          dueDate: assignment.dueDate,
          detectedAt: now
        }
      });
    }

    console.log(`💰 [IMMEDIATE NEGLECT] -${actualDeduction} from ${assignment.userId} for "${assignment.task!.title}"`);
    return { success: true, pointsLost: actualDeduction };

  } catch (error) {
    console.error('Error in markAssignmentAsNeglected:', error);
    return { success: false, pointsLost: 0 };
  }
}
 

}      