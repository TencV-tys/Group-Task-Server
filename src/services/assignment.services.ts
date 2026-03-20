// services/assignment.services.ts - COMPLETE UPDATED VERSION WITH NULL SAFETY
import prisma from "../prisma";
import { AssignmentHelpers } from "../helpers/assignment.helpers";
import { TimeHelpers } from "../helpers/time.helpers";
import { UserNotificationService } from "./user.notification.services";
import { SocketService } from './socket.services';

export class AssignmentService {
  
  // ========== COMPLETE ASSIGNMENT ==========
  static async completeAssignment(
    assignmentId: string,
    userId: string,
    data: { 
      photoUrl?: string;  
      notes?: string;
    }
  ) {
    let timeValidation;
    
    try {
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
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

      // Check if task exists (if task was deleted, don't allow completion)
      if (!assignment.task) {
        return { 
          success: false, 
          message: "This task has been deleted and cannot be completed" 
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
      
      if (now.toDateString() !== dueDate.toDateString()) {
        return { 
          success: false, 
          message: `Cannot complete assignment on this date. It's due on ${dueDate.toLocaleDateString()}`
        };
      }

      let finalPoints = assignment.points;
      let isLate = false;
      let penaltyAmount = 0;

      if (assignment.timeSlot) {
        timeValidation = TimeHelpers.canSubmitAssignment(assignment, now);
        
        if (!timeValidation.allowed) {
          let errorMessage = "Cannot submit assignment at this time.";
          
          if (timeValidation.reason === 'Submission not open yet') {
            const timeUntilStart = timeValidation.opensIn || 0;
            const timeSlot = assignment.timeSlot;
            errorMessage = `Submission opens ${timeUntilStart} minutes before ${timeSlot?.endTime || 'the scheduled time'}. Please wait until then.`;
          } else if (timeValidation.reason === 'Submission window closed') {
            errorMessage = `Submission window has closed. The grace period ended at ${timeValidation.gracePeriodEnd?.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`;
          } else if (timeValidation.reason === 'Not due date') {
            errorMessage = `This assignment is due on ${dueDate.toLocaleDateString()}. Please complete it on that day.`;
          }
          
          return { 
            success: false, 
            message: errorMessage,
            validation: timeValidation
          };
        }
        
        const [endHourStr = '0', endMinuteStr = '0'] = assignment.timeSlot.endTime.split(':');
        const endHour = parseInt(endHourStr, 10);
        const endMinute = parseInt(endMinuteStr, 10);

        if (!isNaN(endHour) && !isNaN(endMinute)) {
          const endTime = new Date(dueDate);
          endTime.setHours(endHour, endMinute, 0, 0);
          
          if (now > endTime) {
            isLate = true;
            penaltyAmount = Math.floor(assignment.points * 0.5);
            finalPoints = assignment.points - penaltyAmount;
          }
        }
        
        console.log(`Assignment ${assignmentId} submitted with ${timeValidation.timeLeft} seconds remaining, isLate: ${isLate}, finalPoints: ${finalPoints}`);
      }

      const updatedAssignment = await prisma.assignment.update({
        where: { id: assignmentId },
        data: {
          completed: true,
          completedAt: new Date(),
          photoUrl: data.photoUrl || undefined, 
          notes: data.notes || (isLate ? `[LATE: Submitted after ${assignment.timeSlot?.endTime}]` : undefined), 
          verified: false,
          points: finalPoints
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

      const admins = await prisma.groupMember.findMany({
        where: {
          groupId: assignment.task.groupId,
          groupRole: "ADMIN",
          isActive: true
        },
        include: { 
          user: { 
            select: { 
              id: true, 
              fullName: true 
            } 
          } 
        }
      });

      console.log(`📢 Notifying ${admins.length} admins about new submission`);

      for (const admin of admins) {
        await UserNotificationService.createNotification({
          userId: admin.userId,
          type: "SUBMISSION_PENDING",
          title: isLate ? "⚠️ Late Submission to Review" : "📝 New Submission to Review",
          message: `${assignment.user?.fullName || "A member"} submitted "${assignment.task.title}"${isLate ? ' (Late)' : ''}`,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            taskTitle: assignment.task.title,
            groupId: assignment.task.group.id,
            groupName: assignment.task.group.name,
            userId: assignment.userId,
            userName: assignment.user?.fullName || 'Unknown',
            userAvatar: assignment.user?.avatarUrl,
            photoUrl: data.photoUrl,
            hasNotes: !!data.notes,
            notes: data.notes,
            submittedAt: new Date(),
            dueDate: assignment.dueDate,
            originalPoints: assignment.points,
            finalPoints: finalPoints,
            isLate: isLate,
            penaltyAmount: penaltyAmount,
            timeSlot: assignment.timeSlot ? {
              startTime: assignment.timeSlot.startTime,
              endTime: assignment.timeSlot.endTime,
              label: assignment.timeSlot.label
            } : null,
            timeLeft: assignment.timeSlot && timeValidation ? timeValidation.timeLeft : undefined
          }
        });
      }
     
      
      // 🔴 EMIT SOCKET EVENT FOR PENDING VERIFICATION
      await SocketService.emitAssignmentPendingVerification(
        assignment.id,
        assignment.taskId || 'unknown-task',
        assignment.task.title,
        assignment.userId,
        assignment.user?.fullName || 'Unknown',
        assignment.task.groupId,
        isLate,
        data.photoUrl
      );

      if (assignment.task.createdById && 
          !admins.some(admin => admin.userId === assignment.task?.createdById)) {
        
        await UserNotificationService.createNotification({
          userId: assignment.task.createdById,
          type: "SUBMISSION_PENDING",
          title: isLate ? "⚠️ Late Task Submission Received" : "📝 Task Submission Received",
          message: `${assignment.user?.fullName || "A member"} submitted "${assignment.task.title}"${isLate ? ' (Late)' : ''}`,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            taskTitle: assignment.task.title,
            groupId: assignment.task.group.id,
            groupName: assignment.task.group.name,
            userId: assignment.userId,
            userName: assignment.user?.fullName || 'Unknown',
            photoUrl: data.photoUrl,
            hasNotes: !!data.notes,
            submittedAt: new Date(),
            isLate: isLate,
            originalPoints: assignment.points,
            finalPoints: finalPoints
          }
        });
      }

      // 🔴 EMIT ASSIGNMENT COMPLETED EVENT
      await SocketService.emitAssignmentCompleted(
        assignment.id,
        assignment.taskId|| 'unknown-task',
        assignment.task.title,
        assignment.userId,
        assignment.user?.fullName || 'Unknown',
        assignment.task.groupId,
        isLate,
        finalPoints,
        data.photoUrl
      );

      if (isLate) {
        await UserNotificationService.createNotification({
          userId: assignment.userId,
          type: "LATE_SUBMISSION",
          title: "⚠️ Late Submission Penalty",
          message: `Your submission for "${assignment.task.title}" was late. Points reduced from ${assignment.points} to ${finalPoints}.`,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            taskTitle: assignment.task.title,
            groupId: assignment.task.group.id,
            originalPoints: assignment.points,
            finalPoints: finalPoints,
            penaltyAmount: penaltyAmount,
            submittedAt: new Date()
          }
        });
      }

      return {
        success: true,
        message: isLate 
          ? `Assignment submitted late. Points reduced from ${assignment.points} to ${finalPoints}. Waiting for admin verification.`
          : "Assignment completed successfully. Waiting for admin verification.",
        assignment: updatedAssignment,
        isLate,
        penaltyAmount,
        originalPoints: assignment.points,
        finalPoints,
        notifications: {
          notifiedAdmins: admins.length,
          showSuccessNotification: true,
          notificationMessage: isLate 
            ? "Your late submission has been sent for review with points reduced" 
            : "Your submission has been sent for review"
        }
      };

    } catch (error: any) {
      console.error("AssignmentService.completeAssignment error:", error);
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

      // Check if task exists
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

      const notificationType = data.verified ? "SUBMISSION_VERIFIED" : "SUBMISSION_REJECTED";
      const notificationTitle = data.verified ? "✅ Task Verified" : "❌ Task Rejected";
      const notificationMessage = data.verified 
        ? `Your submission for "${assignment.task.title}" has been verified! You earned ${assignment.points} points.`
        : `Your submission for "${assignment.task.title}" needs revision.`;

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
          verifiedAt: new Date()
        }
      });

      // 🔴 EMIT SOCKET EVENT FOR VERIFICATION RESULT
      const verifierName = await prisma.user.findUnique({ 
        where: { id: userId }, 
        select: { fullName: true } 
      });

      await SocketService.emitAssignmentVerified(
        assignment.id,
        assignment.taskId|| 'unknown-task',
        assignment.task.title,
        assignment.userId,
        assignment.user?.fullName || 'Unknown',
        assignment.task.groupId,
        data.verified,
        userId,
        verifierName?.fullName || 'Admin',
        assignment.points
      );

      const admins = await prisma.groupMember.findMany({
        where: {
          groupId: assignment.task.groupId,
          groupRole: "ADMIN",
          isActive: true,
          userId: { not: userId }
        }
      });

      for (const admin of admins) {
        await UserNotificationService.createNotification({
          userId: admin.userId,
          type: "SUBMISSION_DECISION",
          title: data.verified ? "✅ Submission Verified" : "❌ Submission Rejected",
          message: `${assignment.user?.fullName || 'Unknown'}'s submission for "${assignment.task.title}" was ${data.verified ? 'verified' : 'rejected'}`,
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
            verifiedAt: new Date()
          }
        });
      }

      return { 
        success: true,
        message: data.verified ? "Assignment verified successfully" : "Assignment rejected",
        assignment: updatedAssignment,
        notifications: {
          notifiedUser: true,
          notifiedOtherAdmins: admins.length
        }
      };

    } catch (error: any) {
      console.error("AssignmentService.verifyAssignment error:", error);
      return { success: false, message: error.message || "Error verifying assignment" };
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
    console.log("📚📚📚 SERVICE: getUpcomingAssignments STARTED 📚📚📚");
    console.log("📚 UserId:", userId);
    console.log("📚 Filters:", filters);
    
    try {
      console.log("📚 Building Prisma query...");
      
      const where: any = {
        userId: userId,
        completed: false
      };

      if (filters?.groupId) {
        where.task = {
          groupId: filters.groupId
        };
      }

      console.log("📚 Where clause:", JSON.stringify(where, null, 2));

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

      console.log(`✅ SERVICE: Found ${assignments.length} assignments`);
      
      // Filter out assignments with null tasks and format safely
      const validAssignments = assignments.filter(a => a.task !== null);
      
      if (validAssignments.length > 0) {
        console.log("📚 First assignment:", JSON.stringify(validAssignments[0], null, 2));
      }

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
      console.error("❌❌❌ SERVICE ERROR:", error);
      console.error("❌ Error stack:", error.stack);
      console.error("❌ Error code:", error.code);
      console.error("❌ Error meta:", error.meta);
      
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

  // ========== GET TODAY'S ASSIGNMENTS ==========
  static async getTodayAssignments(
    userId: string,
    filters?: {
      groupId?: string;
    }
  ) {
    try {
      console.log(`📋 AssignmentService.getTodayAssignments for user: ${userId}`);
      
      const now = new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const where: any = {
        userId,
        completed: false,
        dueDate: {
          gte: today,
          lt: tomorrow
        }
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
        orderBy: { dueDate: 'asc' }
      });

      // Filter out assignments with null tasks
      const validAssignments = assignments.filter(a => a.task !== null);

      // Add time validation info
      const assignmentsWithTimeInfo = validAssignments.map(assignment => {
        const validation = TimeHelpers.canSubmitAssignment(assignment, now);
        
        return {
          id: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task!.title,
          taskPoints: assignment.task!.points,
          group: assignment.task!.group,
          dueDate: assignment.dueDate,
          canSubmit: validation.allowed,
          timeLeft: validation.timeLeft,
          timeLeftText: validation.timeLeft ? TimeHelpers.getTimeLeftText(validation.timeLeft) : null,
          reason: validation.reason,
          timeSlot: assignment.timeSlot,
          willBePenalized: validation.willBePenalized,
          finalPoints: validation.finalPoints
        };
      });

      console.log(`✅ Found ${assignmentsWithTimeInfo.length} today assignments`);

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
      console.error("❌ AssignmentService.getTodayAssignments error:", error);
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

  // ========== CHECK NEGLECTED ASSIGNMENTS (FOR CRON) ==========
static async checkNeglectedAssignments() {
  try {
    const groups = await prisma.group.findMany({ select: { id: true } });
    let totalNeglected = 0;
    let totalPointsNotAwarded = 0;  // ✅ FIXED: Correct variable name

    for (const group of groups) {
      const result = await this.checkGroupNeglectedAssignments(group.id);
      totalNeglected += result.count;
      totalPointsNotAwarded += result.pointsNotAwarded || 0;  // ✅ FIXED: Use pointsNotAwarded
    }

    console.log(`💰 Total points not awarded across all groups: ${totalPointsNotAwarded}`);
    
    return { 
      success: true, 
      totalNeglected,
      totalPointsNotAwarded  // ✅ FIXED: Return correct property name
    };
  } catch (error: any) {
    console.error("AssignmentService.checkNeglectedAssignments error:", error);
    return { success: false, message: error.message };
  }
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

      // Filter out assignments with null tasks
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
        
        // Task starting soon reminder (60 minutes or less)
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

        // Ready to submit reminder (during submission window)
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
  
  // ========== GET ASSIGNMENT DETAILS ==========
  static async getAssignmentDetails(assignmentId: string, userId: string) {
    try {
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          user: { select: { id: true, fullName: true, avatarUrl: true } },
          task: {
            include: {
              group: true,
              creator: { select: { id: true, fullName: true, avatarUrl: true } }
            }
          },
          timeSlot: true
        }
      });

      if (!assignment) {
        return { success: false, message: "Assignment not found" };
      }

      // Check if task exists
      if (!assignment.task) {
        return { 
          success: false, 
          message: "The task associated with this assignment has been deleted" 
        };
      }

      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId: assignment.task.groupId }
      });

      if (!membership) {
        return { success: false, message: "You don't have permission to view this assignment" };
      }

      const isAssignee = assignment.userId === userId;
      const isAdmin = membership.groupRole === "ADMIN";

      if (!isAssignee && !isAdmin) {
        return { success: false, message: "You don't have permission to view this assignment" };
      }

      return {
        success: true,
        message: "Assignment details retrieved",
        assignment
      };

    } catch (error: any) {
      console.error("AssignmentService.getAssignmentDetails error:", error);
      return { success: false, message: error.message || "Error retrieving assignment details" };
    }
  }

  // ========== GET USER ASSIGNMENTS ==========
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
      const where: any = { userId };

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

      if (filters.week !== undefined) {
        where.rotationWeek = filters.week;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

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

      // Filter out assignments with null tasks and format safely
      const validAssignments = assignments.filter(a => a.task !== null);
      
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
          isDueToday: assignment.dueDate >= today && assignment.dueDate < tomorrow
        };
      });

      // Also get historical assignments (deleted tasks)
      const historicalAssignments = await prisma.assignment.findMany({
        where: {
          userId,
          taskId: null,
          taskTitle: { not: null },
          ...(filters.week !== undefined ? { rotationWeek: filters.week } : {})
        },
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
        isHistorical: true
      }));

      return {
        success: true,
        message: "Assignments retrieved successfully",
        assignments: [...formattedAssignments, ...formattedHistorical],
        total: validAssignments.length + historicalAssignments.length,
        filters,
        currentDate: { today, tomorrow }
      };

    } catch (error: any) {
      console.error("AssignmentService.getUserAssignments error:", error);
      return { success: false, message: error.message || "Error retrieving assignments" };
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

    // ===== UPDATED: Get all members that are in rotation =====
    const membersInRotation = await prisma.groupMember.findMany({
      where: { 
        groupId, 
        isActive: true,
        inRotation: true // Only members who should get tasks
      },
      select: { userId: true }
    });

    const memberIdsInRotation = membersInRotation.map(m => m.userId);

    const where: any = { 
      task: { groupId },
      // Only show assignments for members in rotation
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

    // If a specific userId is provided, only include if they're in rotation
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

    // Filter out assignments with null tasks
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

    // Also get historical assignments for members in rotation
    const historicalWhere: any = {
      taskId: null,
      taskTitle: { not: null },
      user: { groups: { some: { groupId } } },
      userId: { in: memberIdsInRotation } // Only historical assignments for members in rotation
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

    // Also get admin info for context (but admins themselves won't have assignments)
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
 
// ========== CHECK GROUP NEGLECTED ASSIGNMENTS - OPTIMIZED VERSION ==========
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
      // Type assertion to access new fields
      const assignmentAny = assignment as any;
      
      // For tasks with multiple time slots
      if (assignment.task!.timeSlots && assignment.task!.timeSlots.length > 1) {
        
        // Parse missedTimeSlotIds from JSON
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
        
        // Check each time slot individually
        const missedSlots: any[] = [];
        let pointsLost = 0;
        
        for (const timeSlot of assignment.task!.timeSlots) {
          // Skip if already marked as missed
          if (existingMissedSlotIds.includes(timeSlot.id)) continue;
          
          // Check if this specific time slot is neglected
          const isSlotNeglected = this.isTimeSlotNeglected(assignment, timeSlot, now);
          
          if (isSlotNeglected) {
            missedSlots.push(timeSlot);
            const slotPoints = timeSlot.points || 0;
            pointsLost += slotPoints;
            totalPointsNotAwarded += slotPoints;
            
            console.log(`⏰ [Group ${groupId}] Missed slot: ${timeSlot.startTime}-${timeSlot.endTime} (${slotPoints} pts) for user ${assignment.user?.fullName}`);
          }
        }
        
        if (missedSlots.length > 0) {
          neglectedCount++;
          
          // Merge existing with new missed slots
          const newMissedSlotIds = [...existingMissedSlotIds, ...missedSlots.map(s => s.id)];
          
          // Calculate remaining points (only from slots not missed)
          const remainingPoints = assignment.task!.timeSlots
            .filter(slot => !newMissedSlotIds.includes(slot.id))
            .reduce((sum, slot) => sum + (slot.points || 0), 0);
          
          // Create notes about missed slots
          const missedSlotsNote = missedSlots.map(s => `${s.startTime}-${s.endTime}`).join(', ');
          const updatedNotes = assignment.notes 
            ? `${assignment.notes}\n[MISSED SLOTS: ${missedSlotsNote}]`
            : `[MISSED SLOTS: ${missedSlotsNote}]`;
          
          // Update assignment with missed slots and remaining points
          await prisma.assignment.update({
            where: { id: assignment.id },
            data: {
              missedTimeSlotIds: newMissedSlotIds,
              points: remainingPoints,
              partiallyExpired: newMissedSlotIds.length < assignment.task!.timeSlots.length,
              notes: updatedNotes,
              expired: missedSlots.length === assignment.task!.timeSlots.length,
              expiredAt: missedSlots.length === assignment.task!.timeSlots.length ? now : undefined
            } as any
          });
          
          // Send notification for each missed slot
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
                remainingPoints,
                dueDate: assignment.dueDate,
                detectedAt: now
              }
            });
          }
          
          // Notify admins about missed slots
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
                dueDate: assignment.dueDate,
                detectedAt: now
              }
            });
          }
        }
        
      } else {
        // Single time slot task - original logic
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
              // ✅ NO points: 0 - keep points for history
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

    if (neglectedCount > 0) {
      console.log(`📊 Group ${groupId}: ${neglectedCount} assignments with missed slots, ${totalPointsNotAwarded} total points not awarded`);
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
  // If already completed, not neglected
  if (assignment.completed) return false;
  
  const dueDate = new Date(assignment.dueDate);
  const today = new Date();
  
  // Check if it's the correct day
  if (dueDate.toDateString() !== today.toDateString()) return false;
  
  // Parse time slot end time
  const endParts = timeSlot.endTime.split(':');
  const endHour = parseInt(endParts[0] || '0', 10);
  const endMinute = parseInt(endParts[1] || '0', 10);
  
  if (isNaN(endHour) || isNaN(endMinute)) return false;
  
  const endTime = new Date(dueDate);
  endTime.setHours(endHour, endMinute, 0, 0);
  
  // Grace period ends 30 minutes after end time
  const gracePeriodEnd = new Date(endTime.getTime() + 30 * 60000);
  
  // If current time is past grace period, this slot is neglected
  if (now > gracePeriodEnd) {
    // Type assertion for new fields
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


// ========== GET NEGLECTED TASKS FOR USER ==========
static async getUserNeglectedTasks(userId: string, filters?: {
  groupId?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    // ===== ADDED: Permission check for group access =====
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

    // ===== IMPROVED: Calculate total points lost =====
    const totalPointsLost = neglectedTasks.reduce((sum, assignment) => {
      return sum + (assignment.timeSlot?.points || assignment.points || 0);
    }, 0);

    // Format the response with additional metadata
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
        pointsLost, // Renamed for clarity
        timeSlot: assignment.timeSlot ? {
          id: assignment.timeSlot.id,
          startTime: assignment.timeSlot.startTime,
          endTime: assignment.timeSlot.endTime,
          label: assignment.timeSlot.label
        } : null,
        notes: assignment.notes,
        // ===== ADDED: Time since expired =====
        daysAgo: assignment.expiredAt 
          ? Math.floor((new Date().getTime() - assignment.expiredAt.getTime()) / (1000 * 60 * 60 * 24))
          : 0
      };
    });

    // ===== ADDED: Group by month for better organization =====
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
    console.error("❌ Error getting user neglected tasks:", error);
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
    // Check if user is admin
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

    // Calculate total points lost per user
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