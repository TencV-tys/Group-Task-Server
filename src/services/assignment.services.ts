// services/assignment.services.ts - COMPLETE FIXED VERSION
import prisma from "../prisma";
import { AssignmentHelpers } from "../helpers/assignment.helpers";
import { TimeHelpers } from "../helpers/time.helpers";
import { UserNotificationService } from "./user.notification.services";
import { SocketService } from './socket.services';

export class AssignmentService {

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
    console.log(`📅 Same day? ${now.toDateString() === dueDate.toDateString()}`);
    
    if (now.toDateString() !== dueDate.toDateString()) {
      console.log(`❌ Wrong day - Due: ${dueDate.toLocaleDateString()}, Today: ${now.toLocaleDateString()}`);
      return { 
        success: false, 
        message: `Cannot complete assignment on this date. It's due on ${dueDate.toLocaleDateString()}`
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
      
      // ✅ FIXED: Only mark as neglected on the due date
      if (!timeValidation.allowed) {
        let errorMessage = "Cannot submit assignment at this time.";
        
        if (timeValidation.reason === 'Submission not open yet') {
          errorMessage = `Submission opens at ${targetTimeSlot.endTime}. Please wait until then.`;
        } else if (timeValidation.reason === 'Submission window closed') {
          errorMessage = `Submission window for ${targetTimeSlot.startTime}-${targetTimeSlot.endTime} has closed.`;
          
          // ✅ ONLY mark as neglected if it's actually the due date
          const isDueDate = now.toDateString() === dueDate.toDateString();
          
          if (isDueDate) {
            await this.markAssignmentAsNeglected(assignmentId, userId);
            errorMessage = `Submission window closed. This task has been marked as missed. -${slotPoints} points deducted.`;
          } else {
            errorMessage = `Submission window closed. You can only submit on the due date: ${dueDate.toLocaleDateString()}.`;
          }
          
        } else if (timeValidation.reason === 'Not due date') {
          errorMessage = `This assignment is due on ${dueDate.toLocaleDateString()}. Please complete it on that day.`;
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

    // ✅ FIXED: Allow verification for:
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

    // ✅ Award points only when verified (approved)
    // For multi-slot tasks, award points for the completed slot
    if (data.verified === true && assignment.points > 0) {
      await prisma.groupMember.updateMany({
        where: {
          userId: assignment.userId,
          groupId: assignment.task.groupId,
          isActive: true
        },
        data: {
          cumulativePoints: {
            increment: assignment.points
          },
          pointsUpdatedAt: new Date()
        }
      });
      
      console.log(`💰💰💰 [POINTS AWARDED] User ${assignment.userId} earned +${assignment.points} points for verified assignment ${assignmentId}`);
      console.log(`   Task: ${assignment.task.title}`);
      console.log(`   Group: ${assignment.task.group.name}`);
    } else if (data.verified === false) {
      console.log(`⚠️ [ASSIGNMENT REJECTED] No points awarded for assignment ${assignmentId}`);
    }

    const notificationType = data.verified ? "SUBMISSION_VERIFIED" : "SUBMISSION_REJECTED";
    const notificationTitle = data.verified ? "✅ Task Verified" : "❌ Task Rejected";
    const notificationMessage = data.verified 
      ? `✅ Your submission for "${assignment.task.title}" has been verified! You earned ${assignment.points} points.`
      : `❌ Your submission for "${assignment.task.title}" needs revision. No points awarded.`;

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
        points: assignment.points,
        verifiedBy: userId,
        verifiedAt: new Date(),
        pointsAwarded: data.verified ? assignment.points : 0
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
      assignment.points
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
        message: `${assignment.user?.fullName || 'Unknown'}'s submission for "${assignment.task.title}" was ${data.verified ? 'verified' : 'rejected'}${data.verified ? ` and awarded ${assignment.points} points` : ''}`,
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
          pointsAwarded: data.verified ? assignment.points : 0
        }
      });
    }

    return { 
      success: true,
      message: data.verified ? "Assignment verified successfully! Points awarded." : "Assignment rejected. No points awarded.",
      assignment: updatedAssignment,
      pointsAwarded: data.verified ? assignment.points : 0,
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

private static isTimeSlotNeglected(assignment: any, timeSlot: any, now: Date): boolean {
  if (assignment.completed) return false;
  
  const dueDate = new Date(assignment.dueDate);
  const today = new Date();
  
  const dueDateUTC = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  
  // Only check for today's assignments
  if (dueDateUTC !== todayUTC) return false;
  
  // ✅ FIXED: dueDate is already in UTC, so just add 30 minutes grace period
  const gracePeriodEnd = new Date(dueDate.getTime() + 30 * 60000);
  
  if (now > gracePeriodEnd) {
    const assignmentAny = assignment as any;
    const existingMissedSlotsRaw = assignmentAny.missedTimeSlotIds;
    let existingMissedSlotIds: string[] = [];
    
    if (existingMissedSlotsRaw) {
      if (typeof existingMissedSlotsRaw === 'string') {
        try {
          existingMissedSlotIds = JSON.parse(existingMissedSlotsRaw);
        } catch (e) {
          existingMissedSlotIds = [];
        }
      } else if (Array.isArray(existingMissedSlotsRaw)) {
        existingMissedSlotIds = existingMissedSlotsRaw;
      }
    }
    
    return !existingMissedSlotIds.includes(timeSlot.id);
  }
  
  return false;
} 
 
static async sendUpcomingTaskReminders(): Promise<{ success: boolean; remindersSent: number; message?: string }> {
  try {
    const now = new Date();
    
    // ✅ Convert to PHT for comparison since slot times are stored in PHT (UTC+8)
    const phtOffset = 8 * 60;
    const phtNow = new Date(now.getTime() + phtOffset * 60000);
    const currentHour = phtNow.getUTCHours();
    const currentMinute = phtNow.getUTCMinutes();
    const currentInMinutes = currentHour * 60 + currentMinute;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1);

    const assignments = await prisma.assignment.findMany({
      where: {
        completed: false,
        dueDate: {
          gte: today,
          lt: tomorrow
        }
      },
      include: {
        user: true,
        task: { 
          include: { 
            group: true 
          } 
        },
        timeSlot: true
      }
    });

    const validAssignments = assignments.filter(a => a.task !== null);
    let remindersSent = 0;

    for (const assignment of validAssignments) {
      if (!assignment.timeSlot) continue;

      // ✅ Slot times are in PHT so compare directly with PHT current time
      const startParts = assignment.timeSlot.startTime.split(':');
      const startHour = parseInt(startParts[0] || '0', 10);
      const startMinute = parseInt(startParts[1] || '0', 10);
      
      if (isNaN(startHour) || isNaN(startMinute)) continue;
      
      const startInMinutes = startHour * 60 + startMinute;
      const timeUntilStart = startInMinutes - currentInMinutes;
      
      // Send reminder if task starts within 60 minutes
      if (timeUntilStart > 0 && timeUntilStart <= 60) {
        const existingReminder = await prisma.userNotification.findFirst({
          where: {
            userId: assignment.userId,
            type: "TASK_REMINDER",
            createdAt: { gte: new Date(Date.now() - 30 * 60000) }
          }
        });

        if (!existingReminder) {
          await UserNotificationService.createNotification({
            userId: assignment.userId,
            type: "TASK_REMINDER",
            title: "⏰ Task Starting Soon",
            message: `"${assignment.task!.title}" starts at ${assignment.timeSlot.startTime} (in ${timeUntilStart} minutes)`,
            data: {
              assignmentId: assignment.id,
              taskId: assignment.task!.id,
              taskTitle: assignment.task!.title,
              groupId: assignment.task!.groupId,
              groupName: assignment.task!.group?.name || 'Group',
              startTime: assignment.timeSlot.startTime,
              endTime: assignment.timeSlot.endTime,
              minutesUntilStart: timeUntilStart,
              dueDate: assignment.dueDate
            }
          });
          remindersSent++;
        }
      }

      // ✅ Check submission window using PHT time
      const endParts = assignment.timeSlot.endTime.split(':');
      const endHour = parseInt(endParts[0] || '0', 10);
      const endMinute = parseInt(endParts[1] || '0', 10);
      
      if (isNaN(endHour) || isNaN(endMinute)) continue;
      
      const endInMinutes = endHour * 60 + endMinute;
      const submissionStartInMinutes = endInMinutes - 0;  // opens AT end time
      const graceEndInMinutes = endInMinutes + 30;        // closes 30 mins after end

      if (currentInMinutes >= submissionStartInMinutes && currentInMinutes <= graceEndInMinutes) {
        const existingActive = await prisma.userNotification.findFirst({
          where: {
            userId: assignment.userId,
            type: "TASK_ACTIVE",
            createdAt: { gte: new Date(Date.now() - 15 * 60000) }
          }
        });

        if (!existingActive) {
          const timeLeft = graceEndInMinutes - currentInMinutes;
          await UserNotificationService.createNotification({
            userId: assignment.userId,
            type: "TASK_ACTIVE",
            title: "🔔 Ready to Submit",
            message: `"${assignment.task!.title}" can now be submitted (${timeLeft} minutes left)`,
            data: {
              assignmentId: assignment.id,
              taskId: assignment.task!.id,
              taskTitle: assignment.task!.title,
              groupId: assignment.task!.groupId,
              groupName: assignment.task!.group?.name || 'Group',
              endTime: assignment.timeSlot.endTime,
              timeLeft,
              dueDate: assignment.dueDate
            }
          });
          remindersSent++;
        }
      }
    }

    return { success: true, remindersSent };
    
  } catch (error: any) {
    console.error("AssignmentService.sendUpcomingTaskReminders error:", error);
    return { success: false, remindersSent: 0, message: error.message };
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
  
  // In assignment.services.ts - FIXED getUserAssignments with proper fields

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

    // FIXED: For 'pending' status, exclude expired and partially expired tasks
    if (filters.status) {
      switch (filters.status) {
        case 'pending':
          where.completed = false;
          where.expired = false;  // EXCLUDE fully expired
          // For pending, show only active tasks (not expired, not partially expired with no future)
          where.OR = [
            { partiallyExpired: false },
            { partiallyExpired: null }
          ];
          console.log(`   ✅ Filter: pending (completed = false, expired = false, partiallyExpired = false/null)`);
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    console.log(`📅 Today: ${today.toISOString()}`);
    console.log(`📅 Tomorrow: ${tomorrow.toISOString()}`);

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
      
      // Safely get the arrays (they might be null or undefined)
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
        isDueToday: assignment.dueDate >= today && assignment.dueDate < tomorrow,
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
      currentDate: { today, tomorrow }
    };

  } catch (error: any) {
    console.error('❌❌❌ [getUserAssignments] ERROR ❌❌❌');
    console.error(error);
    return { success: false, message: error.message || "Error retrieving assignments" };
  }
}

// ========== GET TODAY'S ASSIGNMENTS ==========
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // First, get all assignments for this user
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
    
    // ✅ FIXED: Filter active pending assignments only
    const todayAssignments = allAssignments.filter((assignment: any) => {
      // ❌ Skip completed assignments
      if (assignment.completed) {
        console.log(`⏭️ Skipping COMPLETED assignment: ${assignment.taskTitle} (${assignment.id})`);
        return false;
      }
      
      // ❌ Skip VERIFIED assignments (already earned points)
      if (assignment.verified === true) {
        console.log(`⏭️ Skipping VERIFIED assignment: ${assignment.taskTitle} (${assignment.id})`);
        return false;
      }
      
      // ❌ Skip EXPIRED assignments
      if (assignment.expired === true) {
        console.log(`⏭️ Skipping EXPIRED assignment: ${assignment.taskTitle} (${assignment.id})`);
        return false;
      }
      
      // ❌ Skip partially expired assignments with no remaining slots
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
      
      // Check due date
      if (!assignment.dueDate) {
        console.log(`⏭️ Skipping assignment without due date: ${assignment.taskTitle} (${assignment.id})`);
        return false;
      }
      
      const dueDate = new Date(assignment.dueDate);
      const isDueToday = dueDate >= today && dueDate < tomorrow;
      
      // Filter by group if specified
      const belongsToGroup = !filters?.groupId || assignment.group?.id === filters.groupId;
      
      if (isDueToday) {
        console.log(`✅ Active pending assignment due today: ${assignment.taskTitle} (${assignment.id})`);
        console.log(`   Due date: ${dueDate.toLocaleString()}`);
        console.log(`   Time slot: ${assignment.timeSlot?.startTime} - ${assignment.timeSlot?.endTime}`);
        console.log(`   Completed: ${assignment.completed}, Verified: ${assignment.verified}, Expired: ${assignment.expired}`);
      }
      
      return isDueToday && belongsToGroup;
    });
    
    console.log(`📋 Found ${todayAssignments.length} active pending assignments due today`);
    
    // Transform to TodayAssignment format with time validation
    const assignmentsWithTimeInfo = todayAssignments.map((assignment: any) => {
      const assignmentForValidation = {
        ...assignment,
        timeSlot: assignment.timeSlot,
        points: assignment.points,
        dueDate: assignment.dueDate
      };
      
      const validation = TimeHelpers.canSubmitAssignment(assignmentForValidation, now);
      
      console.log(`📝 Assignment: ${assignment.taskTitle}`, {
        timeSlot: assignment.timeSlot ? `${assignment.timeSlot.startTime}-${assignment.timeSlot.endTime}` : 'none',
        currentTime: now.toLocaleTimeString(),
        canSubmit: validation.allowed,
        reason: validation.reason,
        submissionStatus: validation.submissionStatus,
        willBePenalized: validation.willBePenalized,
        timeLeft: validation.timeLeft
      });
      
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
        submissionStatus: validation.submissionStatus
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

  // ========== GET UPCOMING ASSIGNMENTS ==========
 // In assignment.services.ts - FIXED getUpcomingAssignments with proper fields

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
      expired: false,  // EXCLUDE fully expired tasks
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

    const formattedAssignments = validAssignments.map(assignment => {
      // Safely get the arrays (they might be null or undefined)
      const completedSlotIds = (assignment as any).completedTimeSlotIds || [];
      const missedSlotIds = (assignment as any).missedTimeSlotIds || [];
      
      // Check if this is a multi-slot daily task with future slots
      let isStillActive = true;
      
      if (assignment.task?.executionFrequency === 'DAILY' && assignment.task?.timeSlots?.length > 1) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(assignment.dueDate);
        
        // If due date is in the past, check if there are remaining slots
        if (dueDate < today) {
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


// ========== GET NEGLECTED TASKS FOR USER ==========
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
    
    const where: any = { 
      userId,
      completed: false,
      // ✅ Include assignments that are either expired OR past due date
      AND: [
        {
          OR: [
            { expired: true },
            { dueDate: { lt: now } }  // Due date has passed
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

    const totalPointsLost = neglectedTasks.reduce((sum, assignment) => {
      return sum + (assignment.timeSlot?.points || assignment.points || 0);
    }, 0);

    const formattedTasks = neglectedTasks.map(assignment => {
      const pointsLost = assignment.timeSlot?.points || assignment.points || 0;
      
      return {
        id: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task?.title || 'Deleted Task',
        groupId: assignment.task?.group?.id || filters?.groupId,
        groupName: assignment.task?.group?.name || 'Unknown Group',
        dueDate: assignment.dueDate,
        expiredAt: assignment.expiredAt,
        pointsLost,
        timeSlot: assignment.timeSlot ? {
          id: assignment.timeSlot.id,
          startTime: assignment.timeSlot.startTime,
          endTime: assignment.timeSlot.endTime,
          label: assignment.timeSlot.label
        } : null,
        notes: assignment.notes,
        daysAgo: assignment.expiredAt 
          ? Math.floor((new Date().getTime() - assignment.expiredAt.getTime()) / (1000 * 60 * 60 * 24))
          : 0
      };
    });

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

// ========== GET GROUP NEGLECTED TASKS (FOR ADMINS) ==========
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
    
    const where: any = {
      task: { groupId },
      completed: false,
      // ✅ Include assignments that are either expired OR past due date
      AND: [
        {
          OR: [
            { expired: true },
            { dueDate: { lt: now } }
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
              points: true
            }
          },
          timeSlot: true
        },
        orderBy: { expiredAt: 'desc' },
        take: filters?.limit || 20,
        skip: filters?.offset || 0
      }),
      prisma.assignment.count({ where })
    ]);

    const pointsByUser: Record<string, number> = {};
    neglectedTasks.forEach(task => {
      const points = task.timeSlot?.points || task.points || 0;
      pointsByUser[task.userId] = (pointsByUser[task.userId] || 0) + points;
    });

    const formattedTasks = neglectedTasks.map(assignment => ({
      id: assignment.id,
      taskId: assignment.taskId,
      taskTitle: assignment.task?.title || 'Deleted Task',
      user: assignment.user,
      dueDate: assignment.dueDate,
      expiredAt: assignment.expiredAt,
      points: assignment.timeSlot?.points || assignment.points || 0,
      timeSlot: assignment.timeSlot ? {
        startTime: assignment.timeSlot.startTime,
        endTime: assignment.timeSlot.endTime,
        label: assignment.timeSlot.label
      } : null,
      notes: assignment.notes
    }));

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

// ========== CHECK GROUP NEGLECTED ASSIGNMENTS (FOR CRON) ==========
private static async checkGroupNeglectedAssignments(groupId: string) {
  try {
    const group = await prisma.group.findUnique({ 
      where: { id: groupId },
      select: { currentRotationWeek: true }
    });

    if (!group) return { count: 0, pointsNotAwarded: 0 };

    const now = new Date();
    
    // ✅ Calculate lookback period (7 days)
    const lookbackDays = 7;
    const lookbackStart = new Date(now);
    lookbackStart.setUTCDate(now.getUTCDate() - lookbackDays);
    lookbackStart.setUTCHours(0, 0, 0, 0);
    
    // ✅ ONLY get assignments that are NOT already expired or processed
    const assignments = await prisma.assignment.findMany({
      where: {
        task: { groupId },
        rotationWeek: group.currentRotationWeek,
        completed: false,
        expired: false,
        expiredAt: null,
        dueDate: {
          gte: lookbackStart,
          lt: now
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
          select: {
            id: true,
            fullName: true,
            avatarUrl: true
          }
        }, 
        task: { 
          include: { 
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
      }
    });

    const validAssignments = assignments.filter(a => a.task !== null);
    
    if (validAssignments.length === 0) {
      return { count: 0, pointsNotAwarded: 0 };
    }
    
    console.log(`📊 Checking ${validAssignments.length} assignments for neglect in group ${groupId}`);
    
    let neglectedCount = 0;
    let totalPointsNotAwarded = 0;

    const admins = await prisma.groupMember.findMany({
      where: { 
        groupId, 
        groupRole: "ADMIN",
        isActive: true
      },
      select: { 
        userId: true,
        user: { select: { fullName: true } }
      }
    });

    for (const assignment of validAssignments) {
      // ✅ SAFETY CHECK: Skip if already marked as expired
      if (assignment.expired || assignment.expiredAt !== null) {
        console.log(`⏭️ Skipping already expired assignment: ${assignment.id}`);
        continue;
      }

      const assignmentAny = assignment as any;
      const completedSlotIds: string[] = assignmentAny.completedTimeSlotIds || [];
      const missedSlotIds: string[] = assignmentAny.missedTimeSlotIds || [];
      
      // For tasks with multiple time slots
      if (assignment.task!.timeSlots && assignment.task!.timeSlots.length > 1) {
        const missedSlots: any[] = [];
        let pointsLost = 0;
        
        for (const timeSlot of assignment.task!.timeSlots) {
          if (completedSlotIds.includes(timeSlot.id)) continue;
          if (missedSlotIds.includes(timeSlot.id)) continue;
          
          const isSlotNeglected = this.isTimeSlotNeglected(assignment, timeSlot, now);
          
          if (isSlotNeglected) {
            missedSlots.push(timeSlot);
            const slotPoints = timeSlot.points || assignment.points;
            pointsLost += slotPoints;
            totalPointsNotAwarded += slotPoints;
            
            // ✅ ONLY deduct if not already deducted
            if (!missedSlotIds.includes(timeSlot.id)) {
              await prisma.groupMember.updateMany({
                where: {
                  userId: assignment.userId,
                  groupId: groupId,
                  isActive: true
                },
                data: {
                  cumulativePoints: {
                    decrement: slotPoints
                  },
                  pointsUpdatedAt: new Date()
                }
              });
              console.log(`💰💰💰 [POINTS DEDUCTED] User ${assignment.userId} lost -${slotPoints} points for missing slot ${timeSlot.startTime}-${timeSlot.endTime}`);
            }
          }
        }
        
        if (missedSlots.length > 0) {
          neglectedCount++;
          
          const newMissedSlotIds = [...missedSlotIds, ...missedSlots.map(s => s.id)];
          
          const remainingPoints = assignment.task!.timeSlots
            .filter(slot => !newMissedSlotIds.includes(slot.id) && !completedSlotIds.includes(slot.id))
            .reduce((sum, slot) => sum + (slot.points || 0), 0);
          
          const completedPoints = assignment.task!.timeSlots
            .filter(slot => completedSlotIds.includes(slot.id))
            .reduce((sum, slot) => sum + (slot.points || 0), 0);
          
          const totalRemainingPoints = completedPoints + remainingPoints;
          const allSlotsAccounted = (completedSlotIds.length + newMissedSlotIds.length) === assignment.task!.timeSlots.length;
          
          await prisma.assignment.update({
            where: { id: assignment.id },
            data: {
              missedTimeSlotIds: newMissedSlotIds,
              points: totalRemainingPoints,
              partiallyExpired: newMissedSlotIds.length > 0 && !allSlotsAccounted,
              notes: assignment.notes 
                ? `${assignment.notes}\n[MISSED SLOTS: ${missedSlots.map(s => `${s.startTime}-${s.endTime}`).join(', ')}]`
                : `[MISSED SLOTS: ${missedSlots.map(s => `${s.startTime}-${s.endTime}`).join(', ')}]`,
              expired: allSlotsAccounted && completedSlotIds.length === 0,
              expiredAt: allSlotsAccounted && completedSlotIds.length === 0 ? now : undefined
            }
          });
          
          // Send notifications for missed slots
          for (const slot of missedSlots) {
            await UserNotificationService.createNotification({
              userId: assignment.userId,
              type: "SLOT_MISSED",
              title: "⏰ Time Slot Missed",
              message: `You missed the ${slot.startTime}-${slot.endTime}${slot.label ? ` (${slot.label})` : ''} slot for "${assignment.task!.title}". Lost ${slot.points || 0} points.`,
              data: {
                assignmentId: assignment.id,
                taskId: assignment.taskId,
                taskTitle: assignment.task!.title,
                groupId,
                slotId: slot.id,
                slotTime: `${slot.startTime}-${slot.endTime}`,
                slotLabel: slot.label || '',
                pointsLost: slot.points || 0,
                remainingPoints: totalRemainingPoints,
                completedSlots: completedSlotIds.length,
                missedSlots: newMissedSlotIds.length,
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
              message: `${assignment.user?.fullName || 'Unknown'} missed ${missedSlots.length} time slot(s) for "${assignment.task!.title}" - ${pointsLost} points deducted`,
              data: {
                assignmentId: assignment.id,
                taskId: assignment.taskId,
                taskTitle: assignment.task!.title,
                groupId,
                userId: assignment.userId,
                userName: assignment.user?.fullName || 'Unknown',
                pointsLost,
                completedSlots: completedSlotIds.length,
                totalSlots: assignment.task!.timeSlots.length,
                dueDate: assignment.dueDate.toISOString(),
                detectedAt: now.toISOString()
              }
            });
          }
        }
      } else {
        // Single time slot task
        const isAlreadyNeglected = assignment.expired || assignment.expiredAt !== null;
        
        if (!isAlreadyNeglected && TimeHelpers.isAssignmentNeglected(assignment, now)) {
          neglectedCount++;
          
          const pointsLost = assignment.timeSlot?.points || assignment.points || 0;
          totalPointsNotAwarded += pointsLost;
          
          // ✅ ONLY deduct if not already deducted
          if (!assignment.expired) {
            await prisma.groupMember.updateMany({
              where: {
                userId: assignment.userId,
                groupId: groupId,
                isActive: true
              },
              data: {
                cumulativePoints: {
                  decrement: pointsLost
                },
                pointsUpdatedAt: new Date()
              }
            });
            console.log(`💰💰💰 [POINTS DEDUCTED] User ${assignment.userId} lost -${pointsLost} points for missing task ${assignment.task!.title}`);
          }
          
          await prisma.assignment.update({
            where: { id: assignment.id },
            data: {
              notes: `[MISSED: ${now.toLocaleDateString()}] ${assignment.notes || ''}`,
              expired: true,
              expiredAt: now
            }
          });
          
          // Send notification to user
          await UserNotificationService.createNotification({
            userId: assignment.userId,
            type: "TASK_MISSED",
            title: "⚠️ Task Missed",
            message: `You missed "${assignment.task!.title}" - Lost ${pointsLost} points`,
            data: { 
              assignmentId: assignment.id,
              taskId: assignment.taskId,
              taskTitle: assignment.task!.title,
              groupId,
              pointsLost, 
              dueDate: assignment.dueDate.toISOString(),
              detectedAt: now.toISOString()
            }
          });
          
          // Notify admins
          for (const admin of admins) {
            await UserNotificationService.createNotification({
              userId: admin.userId,
              type: "NEGLECT_DETECTED",
              title: "⚠️ Task Missed",
              message: `${assignment.user?.fullName || 'Unknown'} missed "${assignment.task!.title}" - ${pointsLost} points deducted`,
              data: {
                assignmentId: assignment.id,
                taskId: assignment.taskId,
                taskTitle: assignment.task!.title,
                groupId,
                userId: assignment.userId,
                userName: assignment.user?.fullName || 'Unknown',
                pointsLost,
                dueDate: assignment.dueDate.toISOString(),
                detectedAt: now.toISOString()
              }
            });
          }
        }
      }
    }

    return { 
      count: neglectedCount, 
      pointsNotAwarded: totalPointsNotAwarded
    };
    
  } catch (error) {
    console.error("AssignmentService.checkGroupNeglectedAssignments error:", error);
    return { count: 0, pointsNotAwarded: 0 };
  }
}
 
// In assignment.services.ts - Add this method

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

    if (!assignment || assignment.completed) return;

    const now = new Date();
    const pointsLost = assignment.timeSlot?.points || assignment.points || 0;

    // Deduct points immediately
    await prisma.groupMember.updateMany({
      where: {
        userId: assignment.userId,
        groupId: assignment.task!.groupId,
        isActive: true
      },
      data: {
        cumulativePoints: {
          decrement: pointsLost
        },
        pointsUpdatedAt: now
      }
    });

    // Mark as expired
    await prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        expired: true,
        expiredAt: now,
        notes: `[MISSED: ${now.toLocaleDateString()}] ${assignment.notes || ''}`
      }
    });

    // Get admins
    const admins = await prisma.groupMember.findMany({
      where: {
        groupId: assignment.task!.groupId,
        groupRole: "ADMIN",
        isActive: true
      },
      select: { userId: true, user: { select: { fullName: true } } }
    });

    // Send real-time notification to user
    await UserNotificationService.createNotification({
      userId: assignment.userId,
      type: "TASK_MISSED",
      title: "⚠️ Task Missed",
      message: `You missed "${assignment.task!.title}" - Lost ${pointsLost} points`,
      data: {
        assignmentId: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task!.title,
        groupId: assignment.task!.groupId,
        pointsLost,
        dueDate: assignment.dueDate,
        detectedAt: now
      }
    });

    // Send real-time notifications to admins
    for (const admin of admins) {
      await UserNotificationService.createNotification({
        userId: admin.userId,
        type: "NEGLECT_DETECTED",
        title: "⚠️ Task Missed Immediately",
        message: `${assignment.user?.fullName || 'Unknown'} missed "${assignment.task!.title}" immediately after window closed - ${pointsLost} points deducted`,
        data: {
          assignmentId: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task!.title,
          groupId: assignment.task!.groupId,
          userId: assignment.userId,
          userName: assignment.user?.fullName || 'Unknown',
          pointsLost,
          dueDate: assignment.dueDate,
          detectedAt: now
        }
      });
    }

    console.log(`💰💰💰 [IMMEDIATE NEGLECT] User ${assignment.userId} lost -${pointsLost} points for missing ${assignment.task!.title} immediately after window closed`);

    return { success: true, pointsLost };

  } catch (error) {
    console.error('Error marking assignment as neglected immediately:', error);
    return { success: false, pointsLost: 0 };
  }
}
} 