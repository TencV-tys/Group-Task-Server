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
    console.log(`📝 Assignment ID: ${assignmentId}`);
    console.log(`👤 User ID: ${userId}`);
    console.log(`📸 Photo URL: ${data.photoUrl}`);
    console.log(`📝 Notes: ${data.notes}`);
    console.log(`⏰ TimeSlot ID: ${data.timeSlotId}`);
    
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
      console.log('❌ Assignment not found');
      return { success: false, message: "Assignment not found" };
    }

    // ✅ Check if assignment is already expired/neglected
    if (assignment.expired === true) {
      console.log('❌ Assignment already expired/neglected');
      return { 
        success: false, 
        message: "This assignment has already expired and cannot be completed." 
      };
    }

    console.log(`✅ Assignment found - Task: ${assignment.task?.title}`);
    console.log(`✅ Assignment completed status: ${assignment.completed}`);
    console.log(`✅ Assignment points: ${assignment.points}`);
    console.log(`✅ Assignment dueDate: ${assignment.dueDate}`);
    console.log(`✅ Assignment timeSlot: ${assignment.timeSlot?.startTime} - ${assignment.timeSlot?.endTime}`);

    if (!assignment.task) {
      console.log('❌ Task is null/deleted');
      return { 
        success: false, 
        message: "This task has been deleted and cannot be completed" 
      };
    }

    if (assignment.userId !== userId) {
      console.log(`❌ User mismatch - Assignment user: ${assignment.userId}, Request user: ${userId}`);
      return { success: false, message: "You can only complete your own assignments" };
    }

    if (assignment.completed) {
      console.log('❌ Assignment already completed');
      return { success: false, message: "Assignment already completed" };
    }

    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    
    console.log(`⏰ Current time: ${now.toISOString()}`);
    console.log(`⏰ Due date: ${dueDate.toISOString()}`);
    
    // ✅ FIXED: Use UTC comparison instead of toDateString()
    const isSameDayUTC = 
      now.getUTCFullYear() === dueDate.getUTCFullYear() &&
      now.getUTCMonth() === dueDate.getUTCMonth() &&
      now.getUTCDate() === dueDate.getUTCDate();
    
    console.log(`📅 Same day (UTC)? ${isSameDayUTC}`);
    
    if (!isSameDayUTC) {
      console.log(`❌ Wrong day - Due UTC: ${dueDate.toISOString()}, Today UTC: ${now.toISOString()}`);
      return { 
        success: false, 
        message: `Cannot complete assignment on this date. It's due on ${dueDate.toISOString().split('T')[0]}`
      };
    }

    const assignmentAny = assignment as any;
    const completedSlotIds: string[] = assignmentAny.completedTimeSlotIds || [];
    const missedSlotIds: string[] = assignmentAny.missedTimeSlotIds || [];
    
    console.log(`📊 Existing completed slots: ${completedSlotIds.length}`);
    console.log(`📊 Existing missed slots: ${missedSlotIds.length}`);
    
    // Determine which time slot is being completed
    let targetTimeSlot = null;
    let slotPoints = 0;
    let isMultiSlotTask = assignment.task.timeSlots && assignment.task.timeSlots.length > 1;
    
    console.log(`🔧 Is multi-slot task? ${isMultiSlotTask} - Total slots: ${assignment.task.timeSlots?.length || 0}`);
    
    if (isMultiSlotTask) {
      if (!data.timeSlotId) {
        console.log('❌ No timeSlotId provided for multi-slot task');
        return { 
          success: false, 
          message: "Please select which time slot you are completing" 
        };
      }
      
      console.log(`🎯 Looking for time slot: ${data.timeSlotId}`);
      const foundSlot = assignment.task.timeSlots.find((slot: any) => slot.id === data.timeSlotId);
      
      if (!foundSlot) {
        console.log(`❌ Time slot not found: ${data.timeSlotId}`);
        return { success: false, message: "Invalid time slot specified" };
      }
      
      targetTimeSlot = foundSlot;
      console.log(`✅ Found time slot: ${targetTimeSlot.startTime} - ${targetTimeSlot.endTime}, points: ${targetTimeSlot.points || assignment.points}`);
      
      // Check if this slot was already completed
      if (completedSlotIds.includes(targetTimeSlot.id)) {
        console.log(`❌ Slot already completed: ${targetTimeSlot.startTime}-${targetTimeSlot.endTime}`);
        return { 
          success: false, 
          message: `Time slot ${targetTimeSlot.startTime}-${targetTimeSlot.endTime} was already completed` 
        };
      }
      
      // ✅ Check if this slot was already missed
      if (missedSlotIds.includes(targetTimeSlot.id)) {
        console.log(`❌ Slot already missed: ${targetTimeSlot.startTime}-${targetTimeSlot.endTime}`);
        return { 
          success: false, 
          message: `Time slot ${targetTimeSlot.startTime}-${targetTimeSlot.endTime} was already missed and cannot be completed` 
        };
      }
      
      slotPoints = targetTimeSlot.points || assignment.points;
    } else {
      targetTimeSlot = assignment.timeSlot;
      slotPoints = assignment.points;
      console.log(`📌 Single slot task - using existing time slot: ${targetTimeSlot?.startTime} - ${targetTimeSlot?.endTime}`);
    }

    // Validate submission time
    let finalPoints = slotPoints;
    let isLate = false;
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
        timeLeft: timeValidation.timeLeft,
        opensIn: timeValidation.opensIn,
        submissionStatus: timeValidation.submissionStatus
      });
      
      // ✅ FIXED: Only mark as neglected on the due date using UTC comparison
      if (!timeValidation.allowed) {
        let errorMessage = "Cannot submit assignment at this time.";
        
        if (timeValidation.reason === 'Submission not open yet') {
          errorMessage = `Submission opens at ${targetTimeSlot.endTime}. Please wait until then.`;
        } else if (timeValidation.reason === 'Submission window closed') {
          errorMessage = `Submission window for ${targetTimeSlot.startTime}-${targetTimeSlot.endTime} has closed.`;
          
          // ✅ FIXED: Use UTC comparison for due date check
          const isDueDate = 
            now.getUTCFullYear() === dueDate.getUTCFullYear() &&
            now.getUTCMonth() === dueDate.getUTCMonth() &&
            now.getUTCDate() === dueDate.getUTCDate();
          
          if (isDueDate) {
                // ✅ Don't mark as neglected here - let the cron job handle it
      errorMessage = `Submission window closed. You missed the submission window for this task.`;
          } else {
            errorMessage = `Submission window closed. You can only submit on the due date: ${dueDate.toISOString().split('T')[0]}.`;
          }
          
        } else if (timeValidation.reason === 'Not due date') {
          errorMessage = `This assignment is due on ${dueDate.toISOString().split('T')[0]}. Please complete it on that day.`;
        }
        
        return { 
          success: false, 
          message: errorMessage,
          validation: timeValidation
        };
      }
      
      // Check if late based on the time validation result
      isLate = timeValidation.willBePenalized || false;
      
      if (isLate) {
        penaltyAmount = Math.floor(slotPoints * 0.5);
        finalPoints = slotPoints - penaltyAmount;
        console.log(`⚠️ LATE SUBMISSION! Points reduced from ${slotPoints} to ${finalPoints}`);
      } else {
        console.log(`✅ ON TIME submission! Points: ${slotPoints}`);
      }
      
      console.log(`Assignment ${assignmentId} - Slot ${targetTimeSlot.startTime}-${targetTimeSlot.endTime}: isLate=${isLate}, finalPoints=${finalPoints}`);
    }

    // Update completed time slots
    let updatedCompletedSlots = [...completedSlotIds];
    let updatedPoints = assignment.points;
    let allSlotsCompleted = false;
    
    if (isMultiSlotTask && targetTimeSlot) {
      updatedCompletedSlots = [...completedSlotIds, targetTimeSlot.id];
      console.log(`📊 Updated completed slots: ${updatedCompletedSlots.length}/${assignment.task.timeSlots.length}`);
      
      let totalCompletedPoints = 0;
      for (const slot of assignment.task.timeSlots) {
        if (updatedCompletedSlots.includes(slot.id)) {
          const slotPointsValue = slot.points || assignment.points;
          totalCompletedPoints += slotPointsValue;
        }
      }
      updatedPoints = totalCompletedPoints;
      console.log(`💰 Updated total points: ${updatedPoints}`);
      
      allSlotsCompleted = updatedCompletedSlots.length === assignment.task.timeSlots.length;
      console.log(`🏁 All slots completed? ${allSlotsCompleted}`);
    } else {
      allSlotsCompleted = true;
      updatedPoints = finalPoints;
      console.log(`🏁 Single slot task - marking as completed`);
    }

    // ✅ FIXED: For multi-slot tasks, mark as ready for verification after EACH slot
    const shouldMarkForVerification = isMultiSlotTask ? true : allSlotsCompleted;

    // Update assignment
    const updateData: any = {
      completed: allSlotsCompleted,
      completedAt: allSlotsCompleted ? new Date() : undefined,
      photoUrl: data.photoUrl || undefined,
      notes: data.notes || (isLate ? `[LATE: Submitted after ${targetTimeSlot?.endTime}]` : undefined),
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
    
    console.log(`✅ Assignment updated! New completed: ${updatedAssignment.completed}`);
    console.log(`✅ New verified: ${updatedAssignment.verified}`);
    console.log(`✅ New points: ${updatedAssignment.points}`);
    console.log(`✅ Photo URL saved: ${updatedAssignment.photoUrl}`);

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

    // ✅ Send notification to admins for verification
    for (const admin of admins) {
      await UserNotificationService.createNotification({
        userId: admin.userId,
        type: "SUBMISSION_PENDING",
        title: "📸 New Submission Ready for Review",
        message: `${assignment.user?.fullName || 'A member'} submitted "${assignment.task!.title}" (${targetTimeSlot?.startTime}-${targetTimeSlot?.endTime}) for verification. ${isLate ? '⚠️ Late submission - points reduced.' : '✅ On-time submission.'}`,
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
          isLate,
          originalPoints: slotPoints,
          finalPoints,
          slotsCompleted: updatedCompletedSlots.length,
          totalSlots: assignment.task.timeSlots.length,
          allSlotsCompleted
        }
      });
    }

    let successMessage = "";
    if (allSlotsCompleted) {
      successMessage = isLate 
        ? `All time slots completed late. Points reduced from ${slotPoints} to ${finalPoints}. Waiting for admin verification.`
        : "All time slots completed successfully! Waiting for admin verification.";
    } else {
      successMessage = `Completed ${targetTimeSlot?.startTime}-${targetTimeSlot?.endTime}. ${updatedCompletedSlots.length}/${assignment.task.timeSlots.length} slots done. ${updatedCompletedSlots.length === assignment.task.timeSlots.length - 1 ? 'One more slot to go!' : ''}`;
    }
    
    console.log(`🎉 SUCCESS! ${successMessage}`);
    console.log(`🔵🔵🔵 [COMPLETE ASSIGNMENT] END 🔵🔵🔵`);

    return {
      success: true,
      message: successMessage,
      assignment: updatedAssignment,
      isLate,
      penaltyAmount,
      originalPoints: slotPoints,
      finalPoints,
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

    const now = new Date();
    
    // ✅ FIXED: Only show assignments that are truly expired (after grace period)
    // The cron job sets expired=true or partiallyExpired=true ONLY after 30-min grace period
    const where: any = { 
      userId,
      completed: false,
      AND: [
        {
          // Only tasks that have been officially marked as expired/neglected by cron
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
        include: {
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
          },
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true
            }
          }
        },
        orderBy: { expiredAt: 'desc' },
        take: filters?.limit || 20,
        skip: filters?.offset || 0
      }),
      prisma.assignment.count({ where })
    ]);

    console.log(`📊 Found ${neglectedTasks.length} truly neglected tasks for user ${userId} (only expired=true or partiallyExpired=true)`);

    const formattedTasks = neglectedTasks.map(assignment => {
      const missedSlotIds = (assignment as any).missedTimeSlotIds || [];
      const timeSlots = (assignment.task?.timeSlots || []) as any[];
      
      // Find missed slots with full details
      const missedSlots = timeSlots.filter(slot => missedSlotIds.includes(slot.id));
      
      let totalPointsLost = 0;
      let displayTimeSlot = null;
      
      if (missedSlots.length > 0) {
        displayTimeSlot = missedSlots[0];
        totalPointsLost = missedSlots.reduce((sum, slot) => sum + (slot.points || 0), 0);
      } else if (assignment.timeSlot) {
        displayTimeSlot = assignment.timeSlot;
        totalPointsLost = assignment.timeSlot.points || assignment.points || 0;
      } else if (timeSlots.length > 0) {
        displayTimeSlot = timeSlots[0];
        totalPointsLost = displayTimeSlot.points || 0;
      }
      
      return {
        id: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task?.title || 'Deleted Task',
        groupId: assignment.task?.group?.id || filters?.groupId,
        groupName: assignment.task?.group?.name || 'Unknown Group',
        dueDate: assignment.dueDate,
        expiredAt: assignment.expiredAt,
        points: totalPointsLost,
        timeSlot: displayTimeSlot ? {
          id: displayTimeSlot.id,
          startTime: displayTimeSlot.startTime,
          endTime: displayTimeSlot.endTime,
          label: displayTimeSlot.label,
          points: displayTimeSlot.points
        } : null,
        notes: assignment.notes,
        user: assignment.user,
        missedSlotIds: missedSlotIds,
        missedSlotsCount: missedSlots.length,
        missedSlotsDetails: missedSlots.map(slot => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
          label: slot.label,
          points: slot.points
        })),
        daysAgo: assignment.expiredAt 
          ? Math.floor((new Date().getTime() - assignment.expiredAt.getTime()) / (1000 * 60 * 60 * 24))
          : 0
      };
    });

    const totalPointsLost = formattedTasks.reduce((sum, task) => sum + task.points, 0);
    
    const groupedByMonth = formattedTasks.reduce((acc: any, task) => {
      if (!task.expiredAt) return acc;
      
      const monthYear = task.expiredAt.toLocaleString('default', { 
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
          total,
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

    const now = new Date();
    
    // ✅ FIXED: Only show assignments that are truly expired (after grace period)
    // The cron job sets expired=true or partiallyExpired=true ONLY after 30-min grace period
    const where: any = {
      task: { groupId },
      completed: false,
      AND: [
        {
          // Only tasks that have been officially marked as expired/neglected by cron
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

    console.log(`📊 Found ${neglectedTasks.length} truly neglected tasks in group ${groupId} (only expired=true or partiallyExpired=true)`);

    const pointsByUser: Record<string, number> = {};
    
    const formattedTasks = neglectedTasks.map(assignment => {
      const missedSlotIds = (assignment as any).missedTimeSlotIds || [];
      const timeSlots = (assignment.task?.timeSlots || []) as any[];
      
      // Find missed slots with full details
      const missedSlots = timeSlots.filter(slot => missedSlotIds.includes(slot.id));
      
      let totalPointsLost = 0;
      let displayTimeSlot = null;
      
      if (missedSlots.length > 0) {
        displayTimeSlot = missedSlots[0];
        totalPointsLost = missedSlots.reduce((sum, slot) => sum + (slot.points || 0), 0);
      } else if (assignment.timeSlot) {
        displayTimeSlot = assignment.timeSlot;
        totalPointsLost = assignment.timeSlot.points || assignment.points || 0;
      } else if (timeSlots.length > 0) {
        displayTimeSlot = timeSlots[0];
        totalPointsLost = displayTimeSlot.points || 0;
      }
      
      // Accumulate points by user
      pointsByUser[assignment.userId] = (pointsByUser[assignment.userId] || 0) + totalPointsLost;
      
      return {
        id: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task?.title || 'Deleted Task',
        user: assignment.user,
        dueDate: assignment.dueDate,
        expiredAt: assignment.expiredAt,
        points: totalPointsLost,
        timeSlot: displayTimeSlot ? {
          startTime: displayTimeSlot.startTime,
          endTime: displayTimeSlot.endTime,
          label: displayTimeSlot.label,
          points: displayTimeSlot.points
        } : null,
        notes: assignment.notes,
        missedSlotIds: missedSlotIds,
        missedSlotsCount: missedSlots.length,
        missedSlotsDetails: missedSlots.map(slot => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
          label: slot.label,
          points: slot.points
        }))
      };
    });

    return {
      success: true,
      message: "Group neglected tasks retrieved",
      data: {
        tasks: formattedTasks,
        total,
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
    
    // ✅ FIXED: Use UTC for date boundaries
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
      
      // ✅ Skip already submitted assignments (pending verification)
      if (assignment.photoUrl !== null && assignment.photoUrl !== undefined) {
        console.log(`⏭️ Skipping SUBMITTED (pending verification) assignment: ${assignment.taskTitle} (${assignment.id})`);
        return false;
      }
       
      if (assignment.partiallyExpired === true) {
        const remainingSlots = assignment.timeSlots?.filter((slot: any) => 
          !assignment.completedTimeSlotIds?.includes(slot.id) && 
          !assignment.missedTimeSlotIds?.includes(slot.id)
        );
        if (!remainingSlots || remainingSlots.length === 0) {
          console.log(`⏭️ Skipping PARTIALLY EXPIRED with no remaining slots: ${assignment.taskTitle} (${assignment.id})`);
          return false;
        }
      } 
       
      if (!assignment.dueDate) {
        console.log(`⏭️ Skipping assignment without due date: ${assignment.taskTitle} (${assignment.id})`);
        return false;
      }
      
      const dueDate = new Date(assignment.dueDate);
      // ✅ FIXED: Use UTC comparison
      const isDueToday = dueDate >= todayUTC && dueDate < tomorrowUTC;
      
      const belongsToGroup = !filters?.groupId || assignment.group?.id === filters.groupId;
      
      if (isDueToday) {
        console.log(`✅ Active pending assignment due today: ${assignment.taskTitle} (${assignment.id})`);
        console.log(`   Due date: ${dueDate.toISOString()}`);
        console.log(`   Time slot: ${assignment.timeSlot?.startTime} - ${assignment.timeSlot?.endTime}`);
      }
      
      return isDueToday && belongsToGroup;
    });
    
    console.log(`📋 Found ${todayAssignments.length} active pending assignments due today`);
    
    const assignmentsWithTimeInfo = todayAssignments.map((assignment: any) => {
      const assignmentForValidation = {
        ...assignment,
        timeSlot: assignment.timeSlot,
        points: assignment.points,
        dueDate: assignment.dueDate
      };
      
      const validation = TimeHelpers.canSubmitAssignment(assignmentForValidation, now);
      
      return {
        id: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.taskTitle,
        taskPoints: assignment.points,
        group: assignment.group,
        dueDate: assignment.dueDate,
        canSubmit: validation.allowed,
        timeLeft: validation.timeLeft,
        timeLeftText: validation.timeLeft ? TimeHelpers.getTimeLeftText(validation.timeLeft) : null,
        reason: validation.reason,
        timeSlot: assignment.timeSlot,
        willBePenalized: validation.willBePenalized,
        finalPoints: validation.finalPoints,
        submissionStatus: validation.submissionStatus,
        // ✅ ADD THESE MISSING FIELDS
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
    console.log(`🔍🔍🔍 [getTodayAssignments] END 🔍🔍🔍`);
    
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
    
    console.log(`📊 Initial where clause:`, JSON.stringify(where, null, 2));

    if (filters.status) {
      switch (filters.status) {
        case 'pending':
          where.completed = false;
          where.expired = false;
          where.OR = [
            { partiallyExpired: false },
            { partiallyExpired: null }
          ];
          console.log(`   ✅ Filter: pending (completed = false, expired = false, partiallyExpired = false/null)`);
          break;
              case 'pending_verification':  // ✅ ADD THIS CASE
      where.photoUrl = { not: null };
      where.verified = null;
      where.completed = false;
      console.log(`   ✅ Filter: pending_verification (has photo, awaiting admin)`);
      break;
        case 'completed':
          where.completed = true;
          where.verified = null;
          console.log(`   ✅ Filter: completed (completed = true, verified = null)`);
          break;
        case 'verified':
          where.completed = true;
          where.verified = true;
          console.log(`   ✅ Filter: verified (completed = true, verified = true)`);
          break;
        case 'rejected':
          where.completed = true;
          where.verified = false;
          console.log(`   ✅ Filter: rejected (completed = true, verified = false)`);
          break;
      }
    }

    if (filters.week !== undefined) {
      where.rotationWeek = filters.week;
      console.log(`   ✅ Filter: week = ${filters.week}`);
    }

    // ✅ FIXED: Use UTC for date boundaries
    const { todayUTC, tomorrowUTC } = AssignmentService.getUTCToday();
    
    console.log(`📅 Today UTC: ${todayUTC.toISOString()}`);
    console.log(`📅 Tomorrow UTC: ${tomorrowUTC.toISOString()}`);

    console.log(`🔍 Executing Prisma query...`);
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

    console.log(`📊 Found ${assignments.length} assignments (total: ${total})`);

    const validAssignments = assignments.filter(a => a.task !== null);
    console.log(`✅ Valid assignments (with task): ${validAssignments.length}`);
    
    const formattedAssignments = validAssignments.map(assignment => {
      const verificationStatus = AssignmentHelpers.getVerificationStatus(assignment);
      const timeUntilDue = AssignmentHelpers.getTimeUntilDue(assignment.dueDate);
      
      const completedSlotIds = (assignment as any).completedTimeSlotIds || [];
      const missedSlotIds = (assignment as any).missedTimeSlotIds || [];
      
      return {
        id: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task!.title,
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
        // ✅ FIXED: Use UTC for isDueToday
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

    console.log(`📚 Historical assignments (deleted tasks): ${historicalAssignments.length}`);

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
    console.log(`📊 Total assignments returned: ${allAssignments.length}`);
    console.log(`🔍🔍🔍 [getUserAssignments] END 🔍🔍🔍`);

    return {
      success: true,
      message: "Assignments retrieved successfully",
      assignments: allAssignments,
      total: validAssignments.length + historicalAssignments.length,
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
  
  // Only check assignments due TODAY
  const dueDateUTC = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  if (dueDateUTC !== todayUTC) return false;

  // Parse end time (stored in PHT / UTC+8) → convert to UTC
  const [endHourRaw, endMinRaw] = timeSlot.endTime.split(':');
  let endHour = parseInt(endHourRaw || '0', 10);
  const endMin = parseInt(endMinRaw || '0', 10);

  // PHT (UTC+8) to UTC
  endHour = endHour - 8;
  if (endHour < 0) endHour += 24;

  const endTimeUTC = new Date(dueDate);
  endTimeUTC.setUTCHours(endHour, endMin, 0, 0);

  // ✅ Grace period = endTime + 30 minutes (NO BUFFER)
  const gracePeriodEnd = new Date(endTimeUTC.getTime() + 30 * 60000);

  // ✅ Mark as neglected ONLY AFTER grace period ends
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

// In assignment.services.ts - COMPLETELY FIXED checkGroupNeglectedAssignments

private static async checkGroupNeglectedAssignments(groupId: string) {
  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { currentRotationWeek: true }
    });

    if (!group) return { count: 0, pointsNotAwarded: 0 };

    const now = new Date();
    
    // Get current UTC date
    const { todayUTC, tomorrowUTC } = AssignmentService.getUTCToday();

    // Get ALL assignments due TODAY that are not completed, not expired
    const assignments = await prisma.assignment.findMany({
      where: {
        task: { groupId },
        rotationWeek: group.currentRotationWeek,
        completed: false,
        expired: false,
        expiredAt: null,
        dueDate: {
          gte: todayUTC,
          lt: tomorrowUTC
        },
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
          include: {
            timeSlots: {
              select: { id: true, startTime: true, endTime: true, label: true, points: true }
            }
          }
        },
        timeSlot: {
          select: { id: true, startTime: true, endTime: true, label: true, points: true }
        }
      }
    });

    const validAssignments = assignments.filter(a => a.task !== null);
    if (validAssignments.length === 0) return { count: 0, pointsNotAwarded: 0 };

    console.log(`📊 Checking ${validAssignments.length} assignments for neglect in group ${groupId}`);
    console.log(`⏱️ Current time (UTC): ${now.toISOString()}`);

    let neglectedCount = 0;
    let totalPointsNotAwarded = 0;

    const admins = await prisma.groupMember.findMany({
      where: { groupId, groupRole: "ADMIN", isActive: true },
      select: { userId: true, user: { select: { fullName: true } } }
    });

    for (const assignment of validAssignments) {
      console.log(`\n🔍 Checking assignment: ${assignment.task!.title}`);
      console.log(`   ID: ${assignment.id}`);
      console.log(`   Due date: ${assignment.dueDate.toISOString()}`);
      console.log(`   Time slot: ${assignment.timeSlot?.startTime} - ${assignment.timeSlot?.endTime}`);
      console.log(`   Photo URL: ${assignment.photoUrl ? '✅ Yes (submitted - pending verification)' : '❌ No'}`);
      console.log(`   Verified: ${assignment.verified}`);
      console.log(`   Completed: ${assignment.completed}`);
      
      // ✅ SKIP if assignment has a photo (pending verification)
      if (assignment.photoUrl) {
        console.log(`   ⏭️ SKIPPING - Assignment has photo (pending verification), will not be marked as neglected`);
        continue;
      }
      
      // ✅ SKIP if assignment is already verified
      if (assignment.verified === true) {
        console.log(`   ⏭️ SKIPPING - Assignment already verified`);
        continue;
      }
      
      const assignmentAny = assignment as any;
      const completedSlotIds: string[] = Array.isArray(assignmentAny.completedTimeSlotIds)
        ? assignmentAny.completedTimeSlotIds : [];
      const missedSlotIds: string[] = Array.isArray(assignmentAny.missedTimeSlotIds)
        ? assignmentAny.missedTimeSlotIds : [];

      // Get current user points first
      const currentMember = await prisma.groupMember.findFirst({
        where: { userId: assignment.userId, groupId, isActive: true },
        select: { cumulativePoints: true }
      });
      let currentPoints = currentMember?.cumulativePoints || 0;

      // ========== MULTI-SLOT TASK ==========
      if (assignment.task!.timeSlots && assignment.task!.timeSlots.length > 1) {
        // ✅ Refresh to get latest completed slots (user might have submitted during grace period)
        const freshAssignment = await prisma.assignment.findUnique({
          where: { id: assignment.id },
          select: { 
            completedTimeSlotIds: true,
            photoUrl: true,
            expired: true,
            points: true
          }
        });
        
        let freshCompletedSlotIds: string[] = [];
        if (freshAssignment?.completedTimeSlotIds) {
          const rawValue = freshAssignment.completedTimeSlotIds;
          if (typeof rawValue === 'string') {
            try {
              const parsed = JSON.parse(rawValue);
              if (Array.isArray(parsed)) {
                freshCompletedSlotIds = parsed.filter((item): item is string => typeof item === 'string');
              }
            } catch (e) {
              freshCompletedSlotIds = [];
            }
          } else if (Array.isArray(rawValue)) {
            freshCompletedSlotIds = rawValue.filter((item): item is string => typeof item === 'string');
          }
        }
        
        // ✅ If any slot was completed during grace period, skip marking as neglected
        if (freshCompletedSlotIds.length > 0 && freshCompletedSlotIds.length !== completedSlotIds.length) {
          console.log(`   ⏭️ SKIPPING - Multi-slot assignment has new completed slots (submitted during grace period)`);
          continue;
        }
        
        const newlyMissedSlots: any[] = [];
        let pointsLost = 0;

        for (const timeSlot of assignment.task!.timeSlots) {
          // Skip already accounted slots
          if (completedSlotIds.includes(timeSlot.id)) {
            console.log(`   ✅ Slot ${timeSlot.startTime}-${timeSlot.endTime} already COMPLETED, skipping`);
            continue;
          }
          if (missedSlotIds.includes(timeSlot.id)) {
            console.log(`   ✅ Slot ${timeSlot.startTime}-${timeSlot.endTime} already MISSED, skipping`);
            continue;
          }

          // ✅ Calculate grace period end time (30 minutes AFTER end time)
          const [endHourRaw, endMinRaw] = timeSlot.endTime.split(':');
          let endHour = parseInt(endHourRaw || '0', 10);
          const endMin = parseInt(endMinRaw || '0', 10);
          
          // Convert PHT (UTC+8) to UTC
          endHour = endHour - 8;
          if (endHour < 0) endHour += 24;
          
          const dueDate = new Date(assignment.dueDate);
          const endTimeUTC = new Date(dueDate);
          endTimeUTC.setUTCHours(endHour, endMin, 0, 0);
          
          // ✅ Grace period ends exactly 30 minutes after end time
          const gracePeriodEnd = new Date(endTimeUTC.getTime() + 30 * 60000);
          
          // ✅ ONLY mark as neglected if current time is AFTER grace period ends
          if (now <= gracePeriodEnd) {
            const timeRemaining = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / 1000);
            console.log(`   ⏰ Slot ${timeSlot.startTime}-${timeSlot.endTime} STILL IN GRACE PERIOD (ends in ${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s)`);
            continue;
          }

          console.log(`   ❌ Slot ${timeSlot.startTime}-${timeSlot.endTime} is NEGLECTED (grace period ended)`);
          newlyMissedSlots.push(timeSlot);
          const slotPts = timeSlot.points || 0;
          pointsLost += slotPts;
          totalPointsNotAwarded += slotPts;

          // ✅ PREVENT NEGATIVE POINTS - Only deduct up to current points
          const actualDeduction = Math.min(slotPts, currentPoints);
          if (actualDeduction > 0) {
            await prisma.groupMember.updateMany({
              where: { userId: assignment.userId, groupId, isActive: true },
              data: {
                cumulativePoints: { decrement: actualDeduction },
                pointsUpdatedAt: new Date()
              }
            });
            currentPoints -= actualDeduction;
            console.log(`💰 [POINTS DEDUCTED] -${actualDeduction} from ${assignment.userId} (now has ${currentPoints} pts)`);
          } else {
            console.log(`💰 [POINTS SKIPPED] User has 0 points, no deduction`);
          }
        }

        if (newlyMissedSlots.length > 0) {
          neglectedCount++;

          const updatedMissedIds = [...missedSlotIds, ...newlyMissedSlots.map(s => s.id)];
          const allSlotIds = assignment.task!.timeSlots.map((s: any) => s.id);
          const allSlotsAccounted = allSlotIds.every(
            (id: string) => updatedMissedIds.includes(id) || completedSlotIds.includes(id)
          );

          const completedPoints = assignment.task!.timeSlots
            .filter((s: any) => completedSlotIds.includes(s.id))
            .reduce((sum: number, s: any) => sum + (s.points || 0), 0);

          await prisma.assignment.update({
            where: { id: assignment.id },
            data: {
              missedTimeSlotIds: updatedMissedIds,
              points: completedPoints,
              partiallyExpired: !allSlotsAccounted,
              expired: allSlotsAccounted && completedSlotIds.length === 0,
              expiredAt: allSlotsAccounted && completedSlotIds.length === 0 ? now : undefined
            }
          });

          // Notify user per missed slot
          for (const slot of newlyMissedSlots) {
            const slotPointsValue = Math.min(slot.points || 0, currentPoints + (slot.points || 0));
            await UserNotificationService.createNotification({
              userId: assignment.userId,
              type: "SLOT_MISSED",
              title: "⏰ Time Slot Missed",
              message: slotPointsValue > 0 
                ? `You missed the ${slot.startTime}-${slot.endTime}${slot.label ? ` (${slot.label})` : ''} slot for "${assignment.task!.title}". Lost ${slotPointsValue} points.`
                : `You missed the ${slot.startTime}-${slot.endTime}${slot.label ? ` (${slot.label})` : ''} slot for "${assignment.task!.title}".`,
              data: {
                assignmentId: assignment.id,
                taskId: assignment.taskId,
                taskTitle: assignment.task!.title,
                groupId,
                slotId: slot.id,
                slotTime: `${slot.startTime}-${slot.endTime}`,
                slotLabel: slot.label || '',
                pointsLost: slotPointsValue,
                totalSlots: assignment.task!.timeSlots.length,
                dueDate: assignment.dueDate.toISOString(),
                detectedAt: now.toISOString()
              }
            });
          }

          // Notify admins
          for (const admin of admins) {
            await UserNotificationService.createNotification({
              userId: admin.userId,
              type: "NEGLECT_DETECTED",
              title: "⚠️ Time Slot Missed",
              message: `${assignment.user?.fullName || 'Unknown'} missed ${newlyMissedSlots.length} slot(s) for "${assignment.task!.title}"`,
              data: {
                assignmentId: assignment.id,
                taskId: assignment.taskId,
                taskTitle: assignment.task!.title,
                groupId,
                userId: assignment.userId,
                userName: assignment.user?.fullName || 'Unknown',
                pointsLost: pointsLost,
                totalSlots: assignment.task!.timeSlots.length,
                dueDate: assignment.dueDate.toISOString(),
                detectedAt: now.toISOString()
              }
            });
          }
        }
      } 
      // ========== SINGLE-SLOT TASK ==========
      else {
        // ✅ Calculate grace period end time
        let gracePeriodEnd: Date;
        
        if (!assignment.timeSlot) {
          const endOfDayUTC = new Date(assignment.dueDate);
          endOfDayUTC.setUTCHours(23, 59, 59, 999);
          gracePeriodEnd = new Date(endOfDayUTC.getTime() + 30 * 60000);
        } else {
          const [endHourRaw, endMinRaw] = assignment.timeSlot.endTime.split(':');
          let endHour = parseInt(endHourRaw || '0', 10);
          const endMin = parseInt(endMinRaw || '0', 10);
          
          // Convert PHT (UTC+8) to UTC
          endHour = endHour - 8;
          if (endHour < 0) endHour += 24;
          
          const dueDate = new Date(assignment.dueDate);
          const endTimeUTC = new Date(dueDate);
          endTimeUTC.setUTCHours(endHour, endMin, 0, 0);
          
          // ✅ Grace period ends exactly 30 minutes after end time
          gracePeriodEnd = new Date(endTimeUTC.getTime() + 30 * 60000);
        }
        
        // ✅ ONLY mark as neglected if current time is AFTER grace period ends
        if (now <= gracePeriodEnd) {
          const timeRemaining = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / 1000);
          console.log(`   ⏰ Assignment ${assignment.task!.title} STILL IN GRACE PERIOD (ends in ${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s)`);
          continue;
        }
        
        // ✅ Check AGAIN if assignment has a photo (in case it was submitted during this cron run)
        const freshAssignment = await prisma.assignment.findUnique({
          where: { id: assignment.id },
          select: { photoUrl: true, expired: true }
        });
        
        if (freshAssignment?.photoUrl) {
          console.log(`   ⏭️ SKIPPING - Assignment now has photo (submitted during grace period)`);
          continue;
        }
        
        if (assignment.expired || assignment.expiredAt !== null) {
          console.log(`   ⏭️ Assignment already expired, skipping`);
          continue;
        }

        console.log(`   ❌ Assignment ${assignment.task!.title} is NEGLECTED (grace period ended)`);
        
        neglectedCount++;
        const pointsLost = assignment.timeSlot?.points || assignment.points || 0;
        totalPointsNotAwarded += pointsLost;
 
        // ✅ PREVENT NEGATIVE POINTS - Only deduct up to current points
        const actualDeduction = Math.min(pointsLost, currentPoints);
        
        if (actualDeduction > 0) {
          await prisma.groupMember.updateMany({
            where: { userId: assignment.userId, groupId, isActive: true }, 
            data: {
              cumulativePoints: { decrement: actualDeduction },
              pointsUpdatedAt: new Date()
            }
          });
          console.log(`💰 [POINTS DEDUCTED] -${actualDeduction} from ${assignment.userId}`);
        } else {
          console.log(`💰 [POINTS SKIPPED] User has 0 points, no deduction`);
        }

        await prisma.assignment.update({
          where: { id: assignment.id },
          data: {
            expired: true,
            expiredAt: now,
            notes: `[EXPIRED: Grace period ended] ${assignment.notes || ''}`
          }
        });

        await UserNotificationService.createNotification({
          userId: assignment.userId,
          type: "TASK_MISSED",
          title: "⚠️ Task Missed",
          message: actualDeduction > 0
            ? `You missed "${assignment.task!.title}" — Lost ${actualDeduction} points`
            : `You missed "${assignment.task!.title}" — No points deducted. Keep completing tasks to earn points!`,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            taskTitle: assignment.task!.title,
            groupId,
            pointsLost: actualDeduction,
            dueDate: assignment.dueDate.toISOString(),
            detectedAt: now.toISOString()
          }
        });

        for (const admin of admins) {
          await UserNotificationService.createNotification({
            userId: admin.userId,
            type: "NEGLECT_DETECTED",
            title: "⚠️ Task Missed",
            message: `${assignment.user?.fullName || 'Unknown'} missed "${assignment.task!.title}" — ${actualDeduction} pts deducted${actualDeduction === 0 ? ' (user had 0 points)' : ''}`,
            data: {
              assignmentId: assignment.id,
              taskId: assignment.taskId,
              taskTitle: assignment.task!.title,
              groupId,
              userId: assignment.userId,
              userName: assignment.user?.fullName || 'Unknown',
              pointsLost: actualDeduction,
              dueDate: assignment.dueDate.toISOString(),
              detectedAt: now.toISOString()
            }
          });
        }
      }
    }

    console.log(`\n📊 Neglect detection summary for group ${groupId}: ${neglectedCount} assignments marked as neglected`);
    return { count: neglectedCount, pointsNotAwarded: totalPointsNotAwarded };

  } catch (error) {
    console.error("AssignmentService.checkGroupNeglectedAssignments error:", error);
    return { count: 0, pointsNotAwarded: 0 };
  }
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


static async sendUpcomingTaskReminders(): Promise<{ success: boolean; remindersSent: number; message?: string }> {
  try {
    const processedSlotsThisRun = new Set<string>();
    const now = new Date();

    // ✅ FIXED: Get current time in PHT (Asia/Manila)
    const phtTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const currentHour = phtTime.getHours();
    const currentMinute = phtTime.getMinutes();
    const currentInMinutes = currentHour * 60 + currentMinute;

    console.log(`⏰ [REMINDER] Current PHT time: ${phtTime.toISOString()}`);
    console.log(`   Current hour: ${currentHour}, minute: ${currentMinute}, total minutes: ${currentInMinutes}`);

    const { todayUTC, tomorrowUTC } = AssignmentService.getUTCToday();

    const assignments = await prisma.assignment.findMany({
      where: {
        completed: false,
        expired: false,
        dueDate: { gte: todayUTC, lt: tomorrowUTC }
      },
      include: {
        user: true,
        task: {
          include: {
            group: true,
            timeSlots: { orderBy: { sortOrder: 'asc' } }
          }
        },
        timeSlot: true
      }
    });

    console.log(`📊 Found ${assignments.length} active assignments for today`);

    // Batch fetch admins
    const groupIds = [...new Set(assignments.map(a => a.task?.groupId).filter(Boolean))] as string[];
    const adminMemberships = await prisma.groupMember.findMany({
      where: { groupId: { in: groupIds }, groupRole: "ADMIN", isActive: true },
      select: { userId: true, groupId: true }
    });
    const adminUserIdsByGroup: Record<string, Set<string>> = {};
    for (const m of adminMemberships) {
      if (!adminUserIdsByGroup[m.groupId]) adminUserIdsByGroup[m.groupId] = new Set();
      adminUserIdsByGroup[m.groupId]?.add(m.userId);
    }

    const validAssignments = assignments.filter(a => a.task !== null);
    let remindersSent = 0;
    const DEDUP_WINDOW_MS = 35 * 60_000;

    for (const assignment of validAssignments) {
      const groupAdmins = adminUserIdsByGroup[assignment.task!.groupId] || new Set();
      if (groupAdmins.has(assignment.userId)) {
        console.log(`⏭️ Skipping admin: ${assignment.user?.fullName}`);
        continue;
      }

      const assignmentAny = assignment as any;
      const completedSlotIds: string[] = Array.isArray(assignmentAny.completedTimeSlotIds) ? assignmentAny.completedTimeSlotIds : [];
      const missedSlotIds: string[] = Array.isArray(assignmentAny.missedTimeSlotIds) ? assignmentAny.missedTimeSlotIds : [];

      const allTimeSlots = assignment.task!.timeSlots || [];
      const timeSlotsToCheck = allTimeSlots.length > 0
        ? allTimeSlots
        : assignment.timeSlot ? [assignment.timeSlot] : [];

      if (timeSlotsToCheck.length === 0) continue;

      for (const timeSlot of timeSlotsToCheck) {
        if (completedSlotIds.includes(timeSlot.id)) continue;
        if (missedSlotIds.includes(timeSlot.id)) continue;

        const slotKey = `${assignment.id}_${timeSlot.id}`;
        if (processedSlotsThisRun.has(slotKey)) continue;

        // ---- Upcoming reminder (slot starts within 60 min) ----
        const [startHourStr, startMinStr] = timeSlot.startTime.split(':');
        const startHour = parseInt(startHourStr || '0', 10);
        const startMinute = parseInt(startMinStr || '0', 10);
        if (isNaN(startHour) || isNaN(startMinute)) continue;

        const startInMinutes = startHour * 60 + startMinute;
        const timeUntilStart = startInMinutes - currentInMinutes;

        if (timeUntilStart > 0 && timeUntilStart <= 60) {
          const existingReminder = await prisma.userNotification.findFirst({
            where: {
              userId: assignment.userId,
              type: "TASK_REMINDER",
              createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
              data: { path: "$.slotId", equals: timeSlot.id }
            }
          });

          if (!existingReminder) {
            processedSlotsThisRun.add(slotKey);
            await UserNotificationService.createNotification({
              userId: assignment.userId,
              type: "TASK_REMINDER",
              title: "⏰ Task Starting Soon",
              message: `"${assignment.task!.title}" ${timeSlot.label ? `(${timeSlot.label}) ` : ''}starts at ${timeSlot.startTime} (in ${timeUntilStart} minutes)`,
              data: {
                assignmentId: assignment.id,
                taskId: assignment.task!.id,
                taskTitle: assignment.task!.title,
                groupId: assignment.task!.groupId,
                groupName: assignment.task!.group?.name || 'Group',
                slotId: timeSlot.id,
                startTime: timeSlot.startTime,
                endTime: timeSlot.endTime,
                label: timeSlot.label,
                points: timeSlot.points,
                minutesUntilStart: timeUntilStart,
                dueDate: assignment.dueDate
              }
            });
            remindersSent++;
            console.log(`📢 Reminder: "${assignment.task!.title}" starts in ${timeUntilStart}min → ${assignment.user?.fullName}`);
          }
        }

        // ---- Active/submission-window reminder ----
        const [endHourStr, endMinStr] = timeSlot.endTime.split(':');
        const endHour = parseInt(endHourStr || '0', 10);
        const endMinute = parseInt(endMinStr || '0', 10);
        if (isNaN(endHour) || isNaN(endMinute)) continue;

        const endInMinutes = endHour * 60 + endMinute;
        const submissionStartMins = endInMinutes;       // opens AT end time
        const graceEndMins = endInMinutes + 30;         // closes 30 min after

        if (currentInMinutes >= submissionStartMins && currentInMinutes <= graceEndMins) {
          const activeKey = `${assignment.id}_${timeSlot.id}_active`;
          if (processedSlotsThisRun.has(activeKey)) continue;

          const existingActive = await prisma.userNotification.findFirst({
            where: {
              userId: assignment.userId,
              type: "TASK_ACTIVE",
              createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
              data: { path: "$.slotId", equals: timeSlot.id }
            }
          });

          if (!existingActive) {
            processedSlotsThisRun.add(activeKey);
            const timeLeft = graceEndMins - currentInMinutes;
            const isLate = currentInMinutes > (endInMinutes + 25);

            await UserNotificationService.createNotification({
              userId: assignment.userId,
              type: "TASK_ACTIVE",
              title: isLate ? "⚠️ Late Submission Window" : "🔔 Ready to Submit",
              message: isLate
                ? `"${assignment.task!.title}" ${timeSlot.label ? `(${timeSlot.label}) ` : ''}closing soon! ${timeLeft} min left. Points will be reduced.`
                : `"${assignment.task!.title}" ${timeSlot.label ? `(${timeSlot.label}) ` : ''}can now be submitted (${timeLeft} min left)`,
              data: {
                assignmentId: assignment.id,
                taskId: assignment.task!.id,
                taskTitle: assignment.task!.title,
                groupId: assignment.task!.groupId,
                groupName: assignment.task!.group?.name || 'Group',
                slotId: timeSlot.id,
                startTime: timeSlot.startTime,
                endTime: timeSlot.endTime,
                label: timeSlot.label,
                points: timeSlot.points,
                timeLeft,
                isLate,
                dueDate: assignment.dueDate
              }
            });
            remindersSent++;
            console.log(`📢 Active: "${assignment.task!.title}" - ${timeLeft}min left → ${assignment.user?.fullName}`);
          }
        }
      }
    }

    console.log(`✅ Sent ${remindersSent} reminders`);
    return { success: true, remindersSent };

  } catch (error: any) {
    console.error("AssignmentService.sendUpcomingTaskReminders error:", error);
    return { success: false, remindersSent: 0, message: error.message };
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