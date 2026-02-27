// services/assignment.services.ts - COMPLETE UPDATED VERSION
import prisma from "../prisma";
import { AssignmentHelpers } from "../helpers/assignment.helpers";
import { TimeHelpers } from "../helpers/time.helpers";
import { UserNotificationService } from "./user.notification.services";

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
            errorMessage = `Submission opens ${timeUntilStart} minutes before ${timeSlot.endTime}. Please wait until then.`;
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
          message: `${assignment.user.fullName || "A member"} submitted "${assignment.task.title}"${isLate ? ' (Late)' : ''}`,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            taskTitle: assignment.task.title,
            groupId: assignment.task.group.id,
            groupName: assignment.task.group.name,
            userId: assignment.userId,
            userName: assignment.user.fullName,
            userAvatar: assignment.user.avatarUrl,
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

      if (assignment.task.createdById && 
          !admins.some(admin => admin.userId === assignment.task.createdById)) {
        
        await UserNotificationService.createNotification({
          userId: assignment.task.createdById,
          type: "SUBMISSION_PENDING",
          title: isLate ? "⚠️ Late Task Submission Received" : "📝 Task Submission Received",
          message: `${assignment.user.fullName || "A member"} submitted "${assignment.task.title}"${isLate ? ' (Late)' : ''}`,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            taskTitle: assignment.task.title,
            groupId: assignment.task.group.id,
            groupName: assignment.task.group.name,
            userId: assignment.userId,
            userName: assignment.user.fullName,
            photoUrl: data.photoUrl,
            hasNotes: !!data.notes,
            submittedAt: new Date(),
            isLate: isLate,
            originalPoints: assignment.points,
            finalPoints: finalPoints
          }
        });
      }

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
          message: `${assignment.user.fullName}'s submission for "${assignment.task.title}" was ${data.verified ? 'verified' : 'rejected'}`,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            taskTitle: assignment.task.title,
            groupId: assignment.task.group.id,
            groupName: assignment.task.group.name,
            userId: assignment.userId,
            userName: assignment.user.fullName,
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
    
    if (assignments.length > 0) {
      console.log("📚 First assignment:", JSON.stringify(assignments[0], null, 2));
    }

    return {
      success: true,
      message: "Upcoming assignments retrieved",
      data: {
        assignments: assignments || [],
        currentTime: new Date(),
        total: assignments.length
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

      // Add time validation info
      const assignmentsWithTimeInfo = assignments.map(assignment => {
        const validation = TimeHelpers.canSubmitAssignment(assignment, now);
        
        return {
          id: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task.title,
          taskPoints: assignment.task.points,
          group: assignment.task.group,
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

      console.log(`✅ Found ${assignments.length} today assignments`);

      return {
        success: true,
        message: "Today's assignments retrieved",
        data: {
          assignments: assignmentsWithTimeInfo,
          currentTime: now,
          total: assignments.length
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

      for (const group of groups) {
        const result = await this.checkGroupNeglectedAssignments(group.id);
        totalNeglected += result.count;
      }

      return { success: true, totalNeglected };
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

    let remindersSent = 0;

    for (const assignment of assignments) {
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
            message: `"${assignment.task.title}" starts at ${assignment.timeSlot.startTime} (in ${timeUntilStart} minutes)`,
            data: {
              assignmentId: assignment.id,
              taskId: assignment.task.id,
              taskTitle: assignment.task.title,
              groupId: assignment.task.groupId,
              groupName: assignment.task.group?.name || 'Group',
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
            message: `"${assignment.task.title}" can now be submitted (${timeLeft} minutes left)`,
            data: {
              assignmentId: assignment.id,
              taskId: assignment.task.id,
              taskTitle: assignment.task.title,
              groupId: assignment.task.groupId,
              groupName: assignment.task.group?.name || 'Group',
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

      const formattedAssignments = assignments.map(assignment => {
        const verificationStatus = AssignmentHelpers.getVerificationStatus(assignment);
        const timeUntilDue = AssignmentHelpers.getTimeUntilDue(assignment.dueDate);
        
        return {
          id: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task.title,
          group: assignment.task.group,
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

      return {
        success: true,
        message: "Assignments retrieved successfully",
        assignments: formattedAssignments,
        total,
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

      const where: any = { task: { groupId } };

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

      if (filters.userId) where.userId = filters.userId;
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

      const formattedAssignments = assignments.map(assignment => {
        const verificationStatus = AssignmentHelpers.getVerificationStatus(assignment);
        const timeUntilDue = AssignmentHelpers.getTimeUntilDue(assignment.dueDate);
        
        return {
          id: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task.title,
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

      return {
        success: true,
        message: "Group assignments retrieved successfully",
        assignments: formattedAssignments,
        total,
        filters
      };

    } catch (error: any) {
      console.error("AssignmentService.getGroupAssignments error:", error);
      return { success: false, message: error.message || "Error retrieving group assignments" };
    }
  }
  // services/assignment.services.ts - FIX notes length issue
private static async checkGroupNeglectedAssignments(groupId: string) {
  try {
    const group = await prisma.group.findUnique({ 
      where: { id: groupId },
      select: { currentRotationWeek: true }
    });

    if (!group) return { count: 0 };

    const now = new Date();
    const pendingAssignments = await prisma.assignment.findMany({
      where: {
        task: { groupId },
        rotationWeek: group.currentRotationWeek,
        completed: false
      },
      include: { 
        user: true, 
        task: { include: { timeSlots: true } }, 
        timeSlot: true 
      }
    });

    let neglectedCount = 0;

    for (const assignment of pendingAssignments) {
      if (TimeHelpers.isAssignmentNeglected(assignment, now)) {
        neglectedCount++;

        // FIX: Truncate notes to avoid length issues
        const neglectNote = `[NEGLECTED: Missed submission on ${now.toLocaleDateString()}]`;
        const updatedNotes = assignment.notes 
          ? `${assignment.notes.substring(0, 200)}\n${neglectNote}`.substring(0, 500)
          : neglectNote;

        await prisma.assignment.update({
          where: { id: assignment.id },
          data: {
            notes: updatedNotes
          }
        });

        await UserNotificationService.createNotification({
          userId: assignment.userId,
          type: "POINT_DEDUCTION",
          title: "⚠️ Point Deduction",
          message: `You missed "${assignment.task.title}" and lost ${assignment.points} points`,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            taskTitle: assignment.task.title,
            groupId,
            points: assignment.points,
            dueDate: assignment.dueDate
          }
        });

        const admins = await prisma.groupMember.findMany({
          where: { groupId, groupRole: "ADMIN" }
        });

        for (const admin of admins) {
          await UserNotificationService.createNotification({
            userId: admin.userId,
            type: "NEGLECT_DETECTED",
            title: "⚠️ Missed Assignment",
            message: `${assignment.user.fullName} missed "${assignment.task.title}"`,
            data: {
              assignmentId: assignment.id,
              taskId: assignment.taskId,
              taskTitle: assignment.task.title,
              groupId,
              userId: assignment.userId,
              userName: assignment.user.fullName,
              dueDate: assignment.dueDate
            }
          });
        }
      }
    }

    return { count: neglectedCount };
  } catch (error) {
    console.error("AssignmentService.checkGroupNeglectedAssignments error:", error);
    return { count: 0 };
  }
}
  
}