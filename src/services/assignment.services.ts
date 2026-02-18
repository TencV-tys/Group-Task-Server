// services/assignment.services.ts - NEW FILE
import prisma from "../prisma";
import { AssignmentHelpers } from "../helpers/assignment.helpers";
import { TimeHelpers } from "../helpers/time.helpers";
export class AssignmentService {
  
   static async completeAssignment(
    assignmentId: string,
    userId: string,
    data: {
      photoUrl?: string;
      notes?: string;
    }
  ) {
    // Declare timeValidation here so it's available in the whole function
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

      // Check if assignment belongs to user
      if (assignment.userId !== userId) {
        return { success: false, message: "You can only complete your own assignments" };
      }

      // Check if already completed
      if (assignment.completed) {
        return { success: false, message: "Assignment already completed" };
      }

      // Validate due date
      const now = new Date();
      const dueDate = new Date(assignment.dueDate);
      
      // Check if it's the correct day
      if (now.toDateString() !== dueDate.toDateString()) {
        return { 
          success: false, 
          message: `Cannot complete assignment on this date. It's due on ${dueDate.toLocaleDateString()}`
        };
      }

      // TIME VALIDATION LOGIC
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
        
        // If validation passed, we have timeLeft
        console.log(`Assignment ${assignmentId} submitted with ${timeValidation.timeLeft} seconds remaining`);
      } else {
        // No time slot, just check if it's the due date
        console.log(`Assignment ${assignmentId} submitted (no time slot)`);
      }

      // Update assignment
      const updatedAssignment = await prisma.assignment.update({
        where: { id: assignmentId },
        data: {
          completed: true,
          completedAt: new Date(),
          photoUrl: data.photoUrl || undefined, 
          notes: data.notes || undefined, 
          verified: false // Reset verification status to null (pending)
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

      // ========== NOTIFY ALL GROUP ADMINS ==========
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

      // Create notifications for each admin
      for (const admin of admins) {
        await prisma.userNotification.create({
          data: {
            userId: admin.userId,
            type: "SUBMISSION_PENDING",
            title: "📝 New Submission to Review",
            message: `${assignment.user.fullName || "A member"} submitted "${assignment.task.title}"`,
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
              points: assignment.points,
              timeSlot: assignment.timeSlot ? {
                startTime: assignment.timeSlot.startTime,
                endTime: assignment.timeSlot.endTime,
                label: assignment.timeSlot.label
              } : null,
              timeLeft: assignment.timeSlot && timeValidation ? timeValidation.timeLeft : undefined
            },
            read: false
          }
        });

        // Optional: Send push notification if you have push service
        // await sendPushNotification(admin.userId, {
        //   title: "New Submission",
        //   body: `${assignment.user.fullName} submitted "${assignment.task.title}"`
        // });
      }

      // ========== NOTIFY TASK CREATOR (if different from admins) ==========
      if (assignment.task.createdById && 
          !admins.some(admin => admin.userId === assignment.task.createdById)) {
        
        await prisma.userNotification.create({
          data: {
            userId: assignment.task.createdById,
            type: "SUBMISSION_PENDING",
            title: "📝 Task Submission Received",
            message: `${assignment.user.fullName || "A member"} submitted "${assignment.task.title}"`,
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
              submittedAt: new Date()
            },
            read: false
          }
        });
      }

      return {
        success: true,
        message: "Assignment completed successfully. Waiting for admin verification.",
        assignment: updatedAssignment,
        notifiedAdmins: admins.length
      };

    } catch (error: any) {
      console.error("AssignmentService.completeAssignment error:", error);
      return { success: false, message: error.message || "Error completing assignment" };
    }
  }

  // In assignment.services.ts - UPDATE verifyAssignment method
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

    // Check if user is admin of the group
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

    // Check if assignment is completed
    if (!assignment.completed) {
      return { success: false, message: "Assignment must be completed before verification" };
    }

    // Update assignment
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

    // ========== NOTIFY THE USER ==========
    const notificationType = data.verified ? "SUBMISSION_VERIFIED" : "SUBMISSION_REJECTED";
    const notificationTitle = data.verified ? "✅ Task Verified" : "❌ Task Rejected";
    const notificationMessage = data.verified 
      ? `Your submission for "${assignment.task.title}" has been verified! You earned ${assignment.points} points.`
      : `Your submission for "${assignment.task.title}" needs revision.`;

    await prisma.userNotification.create({
      data: {
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
        },
        read: false
      }
    });

    // ========== NOTIFY ALL ADMINS ABOUT THE DECISION ==========
    const admins = await prisma.groupMember.findMany({
      where: {
        groupId: assignment.task.groupId,
        groupRole: "ADMIN",
        isActive: true,
        userId: { not: userId } // Don't notify the admin who just verified
      }
    });

    for (const admin of admins) {
      await prisma.userNotification.create({
        data: {
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
          },
          read: false
        }
      });
    }

    return { 
      success: true,
      message: data.verified ? "Assignment verified successfully" : "Assignment rejected",
      assignment: updatedAssignment
    };

  } catch (error: any) {
    console.error("AssignmentService.verifyAssignment error:", error);
    return { success: false, message: error.message || "Error verifying assignment" };
  }
}
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

      // Check if user has permission (either the assignee or group admin)
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId: assignment.task.groupId
        }
      });

      if (!membership) {
        return { success: false, message: "You don't have permission to view this assignment" };
      }

      const isAssignee = assignment.userId === userId;
      const isAdmin = membership.groupRole === "ADMIN";

      // If not assignee and not admin, restrict access
      if (!isAssignee && !isAdmin) {
        return { success: false, message: "You don't have permission to view this assignment" };
      }

      return {
        success: true,
        message: "Assignment details retrieved",
        assignment: assignment
      };

    } catch (error: any) {
      console.error("AssignmentService.getAssignmentDetails error:", error);
      return { success: false, message: error.message || "Error retrieving assignment details" };
    }
  }
// In assignment.services.ts - Update getUserAssignments
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
    const where: any = {
      userId
    };

    // Apply status filter
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

    // Apply week filter
    if (filters.week !== undefined) {
      where.rotationWeek = filters.week;
    }

    // ADD THIS: Get today's date info
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
              group: {
                select: {
                  id: true,
                  name: true
                }
              }
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
        // ADD THIS: Is due today flag
        isDueToday: assignment.dueDate >= today && assignment.dueDate < tomorrow
      };
    });

    return {
      success: true,
      message: "Assignments retrieved successfully",
      assignments: formattedAssignments,
      total,
      filters,
      // ADD THIS: Current date info
      currentDate: {
        today,
        tomorrow
      }
    };

  } catch (error: any) {
    console.error("AssignmentService.getUserAssignments error:", error);
    return { success: false, message: error.message || "Error retrieving assignments" };
  }
}
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
      // Check if requesting user is admin
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId: requestingUserId,
          groupId,
          groupRole: "ADMIN"
        }
      });

      if (!membership) {
        return { success: false, message: "Only group admins can view all assignments" };
      }

      const where: any = {
        task: {
          groupId
        }
      };

      // Apply status filter
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

      // Apply user filter
      if (filters.userId) {
        where.userId = filters.userId;
      }

      // Apply week filter
      if (filters.week !== undefined) {
        where.rotationWeek = filters.week;
      }

      const [assignments, total] = await Promise.all([
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
}
