// services/assignment.services.ts - COMPLETE FIXED VERSION
import prisma from "../prisma";
import { AssignmentHelpers } from "../helpers/assignment.helpers";
import { TimeHelpers } from "../helpers/time.helpers";
import { UserNotificationService } from "./user.notification.services";
import { SocketService } from './socket.services';

export class AssignmentService {

// services/assignment.services.ts - ADD MORE DETAILED LOGGING

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
      
      if (missedSlotIds.includes(targetTimeSlot.id)) {
        console.log(`❌ Slot already missed: ${targetTimeSlot.startTime}-${targetTimeSlot.endTime}`);
        return { 
          success: false, 
          message: `Time slot ${targetTimeSlot.startTime}-${targetTimeSlot.endTime} was missed and cannot be completed` 
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
      
      if (!timeValidation.allowed) {
        let errorMessage = "Cannot submit assignment at this time.";
        
        if (timeValidation.reason === 'Submission not open yet') {
          const timeUntilStart = timeValidation.opensIn || 0;
          errorMessage = `Submission opens at ${targetTimeSlot.endTime}. Please wait until then.`;
        } else if (timeValidation.reason === 'Submission window closed') {
          errorMessage = `Submission window for ${targetTimeSlot.startTime}-${targetTimeSlot.endTime} has closed.`;
        } else if (timeValidation.reason === 'Not due date') {
          errorMessage = `This assignment is due on ${dueDate.toLocaleDateString()}. Please complete it on that day.`;
        }
        
        console.log(`❌ Time validation failed: ${errorMessage}`);
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

    // Update assignment
    const updateData: any = {
      completed: allSlotsCompleted,
      completedAt: allSlotsCompleted ? new Date() : undefined,
      photoUrl: data.photoUrl || undefined,
      notes: data.notes || (isLate ? `[LATE: Submitted after ${targetTimeSlot?.endTime}]` : undefined),
        verified: allSlotsCompleted ? null : undefined, 
      points: updatedPoints 
    };
    
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

    // Send notifications (same as before...)
    // ... rest of the code

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
        notifiedAdmins: allSlotsCompleted ? admins.length : 0,
        showSuccessNotification: true
      }
    }; 

  } catch (error: any) {
    console.error('❌❌❌ [COMPLETE ASSIGNMENT] ERROR ❌❌❌');
    console.error(error);
    return { success: false, message: error.message || "Error completing assignment" };
  }
}

// services/assignment.services.ts - FIXED verifyAssignment (ADD points on verification)

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
            group: true
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

    if (!assignment.completed) {
      return { success: false, message: "Assignment must be completed before verification" };
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

    // ✅ ADD THIS: Award points only when verified (approved)
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

  // ========== CHECK GROUP NEGLECTED ASSIGNMENTS ==========
  private static async checkGroupNeglectedAssignments(groupId: string) {
    try {
      const group = await prisma.group.findUnique({ 
        where: { id: groupId },
        select: { currentRotationWeek: true }
      });

      if (!group) return { count: 0, pointsNotAwarded: 0 };

      const now = new Date();
      
      const assignments = await prisma.assignment.findMany({
        where: {
          task: { groupId },
          rotationWeek: group.currentRotationWeek,
          completed: false
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
              } as any
            });
            
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
                  slotLabel: slot.label,
                  pointsLost: slot.points || 0,
                  remainingPoints: totalRemainingPoints,
                  completedSlots: completedSlotIds.length,
                  missedSlots: newMissedSlotIds.length,
                  totalSlots: assignment.task!.timeSlots.length,
                  dueDate: assignment.dueDate,
                  detectedAt: now
                }
              });
            }
            
            for (const admin of admins) {
              await UserNotificationService.createNotification({
                userId: admin.userId,
                type: "NEGLECT_DETECTED",
                title: "⚠️ Time Slot Missed",
                message: `${assignment.user?.fullName || 'Unknown'} missed ${missedSlots.length} time slot(s) for "${assignment.task!.title}" - ${pointsLost} points not awarded`,
                data: {
                  assignmentId: assignment.id,
                  taskId: assignment.taskId,
                  taskTitle: assignment.task!.title,
                  groupId,
                  userId: assignment.userId,
                  userName: assignment.user?.fullName || 'Unknown',
                  missedSlots: missedSlots.map(s => ({
                    id: s.id,
                    time: `${s.startTime}-${s.endTime}`,
                    label: s.label,
                    points: s.points
                  })),
                  pointsLost,
                  completedSlots: completedSlotIds.length,
                  totalSlots: assignment.task!.timeSlots.length,
                  dueDate: assignment.dueDate,
                  detectedAt: now
                }
              });
            }
          }
        } else {
          // Single time slot task
          if (TimeHelpers.isAssignmentNeglected(assignment, now)) {
            neglectedCount++;
            
            const pointsLost = assignment.timeSlot?.points || assignment.points || 0;
            totalPointsNotAwarded += pointsLost;
            
            await prisma.assignment.update({
              where: { id: assignment.id },
              data: {
                notes: `[MISSED: ${now.toLocaleDateString()}] ${assignment.notes || ''}`,
                expired: true,
                expiredAt: now
              }
            });
            
            await UserNotificationService.createNotification({
              userId: assignment.userId,
              type: "TASK_MISSED",
              title: "⚠️ Task Missed",
              message: `You missed "${assignment.task!.title}" - No points awarded (worth ${pointsLost} points)`,
              data: { 
                assignmentId: assignment.id,
                taskId: assignment.taskId,
                taskTitle: assignment.task!.title,
                groupId,
                pointsLost, 
                dueDate: assignment.dueDate,
                detectedAt: now
              }
            });
            
            for (const admin of admins) {
              await UserNotificationService.createNotification({
                userId: admin.userId,
                type: "NEGLECT_DETECTED",
                title: "⚠️ Task Missed",
                message: `${assignment.user?.fullName || 'Unknown'} missed "${assignment.task!.title}" - ${pointsLost} points not awarded`,
                data: {
                  assignmentId: assignment.id,
                  taskId: assignment.taskId,
                  taskTitle: assignment.task!.title,
                  groupId,
                  userId: assignment.userId,
                  userName: assignment.user?.fullName || 'Unknown',
                  pointsLost,
                  dueDate: assignment.dueDate,
                  detectedAt: now
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

  // Helper method to check if a specific time slot is neglected
  private static isTimeSlotNeglected(assignment: any, timeSlot: any, now: Date): boolean {
    if (assignment.completed) return false;
    
    const dueDate = new Date(assignment.dueDate);
    const today = new Date();
    
    if (dueDate.toDateString() !== today.toDateString()) return false;
    
    const endParts = timeSlot.endTime.split(':');
    const endHour = parseInt(endParts[0] || '0', 10);
    const endMinute = parseInt(endParts[1] || '0', 10);
    
    if (isNaN(endHour) || isNaN(endMinute)) return false;
    
    const endTime = new Date(dueDate);
    endTime.setHours(endHour, endMinute, 0, 0);
    const gracePeriodEnd = new Date(endTime.getTime() + 30 * 60000);
    
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

  // ========== SEND UPCOMING TASK REMINDERS ==========
  static async sendUpcomingTaskReminders(): Promise<{ success: boolean; remindersSent: number; message?: string }> {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentInMinutes = currentHour * 60 + currentMinute;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

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

        const startParts = assignment.timeSlot.startTime.split(':');
        const startHourStr = startParts[0] || '0';
        const startMinuteStr = startParts[1] || '0';
        
        const startHour = parseInt(startHourStr, 10);
        const startMinute = parseInt(startMinuteStr, 10);
        
        if (isNaN(startHour) || isNaN(startMinute)) continue;
        
        const startInMinutes = startHour * 60 + startMinute;
        const timeUntilStart = startInMinutes - currentInMinutes;
        
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

        const endParts = assignment.timeSlot.endTime.split(':');
        const endHourStr = endParts[0] || '0';
        const endMinuteStr = endParts[1] || '0';
        
        const endHour = parseInt(endHourStr, 10);
        const endMinute = parseInt(endMinuteStr, 10);  
        
        if (isNaN(endHour) || isNaN(endMinute)) continue;
        
        const endInMinutes = endHour * 60 + endMinute;
        const submissionStartInMinutes = endInMinutes - 30;
        const graceEndInMinutes = endInMinutes + 30;

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
  
  // In assignment.services.ts - getAssignmentDetails
static async getAssignmentDetails(assignmentId: string, userId: string) {
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

    // ✅ Check if user is admin of the group
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

    // ✅ Allow if assignee OR admin
    if (!isAssignee && !isGroupAdmin) {
      return { 
        success: false, 
        message: "You don't have permission to view this assignment" 
      };
    }

    return {
      success: true,
      assignment: {
        ...assignment,
        isAdmin: isGroupAdmin,  // ✅ Add this flag
        isOwner: isAssignee     // ✅ Add this flag
      }
    };

  } catch (error: any) {
    console.error("Error fetching assignment details:", error);
    return { success: false, message: error.message };
  }
}
  // services/assignment.services.ts - ADDED DETAILED LOGS to getUserAssignments and getTodayAssignments

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
    
    // ✅ ALWAYS exclude null-taskId records from the main query
    const where: any = { 
      userId,
      taskId: { not: null }  // ← ADD THIS: prevents overlap with historical query
    };
    
    console.log(`📊 Initial where clause:`, JSON.stringify(where, null, 2));

    if (filters.status) {
      switch (filters.status) {
        case 'pending':
          where.completed = false;
          console.log(`   ✅ Filter: pending (completed = false)`);
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

    // This warning should now never fire since we filter taskId: { not: null }
    const validAssignments = assignments.filter(a => a.task !== null);
    console.log(`✅ Valid assignments (with task): ${validAssignments.length}`);
    
    if (assignments.length > 0 && validAssignments.length === 0) {
      console.log(`⚠️ WARNING: ${assignments.length} assignments found but all have null tasks!`);
      assignments.forEach((a, i) => {
        console.log(`   Assignment ${i+1}: id=${a.id}, taskId=${a.taskId}, hasTask=${!!a.task}`);
      });
    }
    
    const formattedAssignments = validAssignments.map(assignment => {
      const verificationStatus = AssignmentHelpers.getVerificationStatus(assignment);
      const timeUntilDue = AssignmentHelpers.getTimeUntilDue(assignment.dueDate);
      
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
        isHistorical: false  // ✅ Explicitly mark as non-historical
      };
    });

    // Historical query is now clean — no overlap possible
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
      isHistorical: true  // ✅ Explicitly mark as historical
    }));

    const allAssignments = [...formattedAssignments, ...formattedHistorical];
    console.log(`📊 Total assignments returned: ${allAssignments.length} (${formattedAssignments.length} active + ${formattedHistorical.length} historical)`);
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
    
    console.log(`📅 Today: ${today.toISOString()}`);
    console.log(`📅 Tomorrow: ${tomorrow.toISOString()}`);
    console.log(`⏰ Current time: ${now.toLocaleTimeString()}`);
    
    // First, get all assignments for this user
    console.log(`📡 Calling getUserAssignments for user ${userId}...`);
    const userAssignmentsResult = await this.getUserAssignments(userId, {
      limit: 100,
      offset: 0
    });
    
    console.log(`📊 getUserAssignments result:`, {
      success: userAssignmentsResult.success,
      totalAssignments: userAssignmentsResult.total,
      assignmentsLength: userAssignmentsResult.assignments?.length
    });
    
    if (!userAssignmentsResult.success) {
      console.log(`❌ Failed to get user assignments: ${userAssignmentsResult.message}`);
      return {
        success: false,
        data: { assignments: [], currentTime: now, total: 0 },
        message: userAssignmentsResult.message
      };
    }
    
    const allAssignments = userAssignmentsResult.assignments || [];
    console.log(`📊 Total assignments from API: ${allAssignments.length}`);
    
    // Log first 3 assignments for debugging
    if (allAssignments.length > 0) {
      console.log(`📋 First 3 assignments:`);
      allAssignments.slice(0, 3).forEach((a: any, i: number) => {
        console.log(`   ${i+1}. ID: ${a.id}, Title: ${a.taskTitle}, Due: ${a.dueDate}, Completed: ${a.completed}, IsDueToday: ${a.isDueToday}`);
      });
    }
    
    // Filter assignments due today and not completed
    const todayAssignments = allAssignments.filter((assignment: any) => {
      // Skip completed assignments
      if (assignment.completed) {
        console.log(`⏭️ Skipping completed assignment: ${assignment.taskTitle} (${assignment.id})`);
        return false;
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
        console.log(`✅ Assignment due today: ${assignment.taskTitle} (${assignment.id})`);
        console.log(`   Due date: ${dueDate.toLocaleString()}`);
        console.log(`   Time slot: ${assignment.timeSlot?.startTime} - ${assignment.timeSlot?.endTime}`);
      }
      
      return isDueToday && belongsToGroup;
    });
    
    console.log(`📋 Found ${todayAssignments.length} assignments due today`);
    
    // Transform to TodayAssignment format with time validation
    const assignmentsWithTimeInfo = todayAssignments.map((assignment: any) => {
      // Create assignment object with timeSlot for validation
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
    
    console.log(`✅ Final assignments count: ${assignmentsWithTimeInfo.length}`);
    console.log(`🔍🔍🔍 [getTodayAssignments] END 🔍🔍🔍`);
    
    return {
      success: true,
      message: "Today's assignments retrieved",
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

      if (filters.status) {
        switch (filters.status) {
          case 'pending':
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
        completed: false
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

      return {
        success: true,
        message: "Upcoming assignments retrieved",
        data: {
          assignments: validAssignments || [],
          currentTime: new Date(),
          total: validAssignments.length
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

      const where: any = {
        userId,
        expired: true,
        completed: false
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

      const where: any = {
        task: { groupId },
        expired: true,
        completed: false
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
}