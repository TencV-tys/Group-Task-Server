// services/assignment.services.ts - NEW FILE
import prisma from "../prisma";
import { AssignmentHelpers } from "../helpers/assignment.helpers";

export class AssignmentService {
  
  static async completeAssignment(
    assignmentId: string,
    userId: string,
    data: {
      photoUrl?: string;
      notes?: string;
    }
  ) {
    try {
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          user: { // ADD THIS: Include the user relation
            select: { 
              id: true, 
              fullName: true, 
              avatarUrl: true 
            }
          },
          task: {
            include: {
              group: true
            }
          }
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
      if (assignment.dueDate < now) {
        return { success: false, message: "Cannot complete past due assignments" };
      }

      // Update assignment
      const updatedAssignment = await prisma.assignment.update({
        where: { id: assignmentId },
        data: {
          completed: true,
          completedAt: new Date(),
          photoUrl: data.photoUrl || undefined,
          notes: data.notes || undefined,
          verified: false // Reset verification status
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

      // Create notification for admins
      const admins = await prisma.groupMember.findMany({
        where: {
          groupId: assignment.task.groupId,
          groupRole: "ADMIN",
          isActive: true
        },
        include: { user: true }
      });

      for (const admin of admins) {
        await prisma.userNotification.create({
          data: {
            userId: admin.userId,
            type: "ASSIGNMENT_COMPLETED",
            title: "Task Completed",
            message: `${assignment.user.fullName || "A user"} completed "${assignment.task.title}"`, // FIXED: now assignment.user exists
            data: {
              assignmentId: assignment.id,
              taskId: assignment.taskId,
              groupId: assignment.task.groupId,
              userId: assignment.userId,
              photoUrl: data.photoUrl,
              notes: data.notes
            },
            read: false
          }
        });
      }

      return {
        success: true,
        message: "Assignment completed successfully",
        assignment: updatedAssignment
      };

    } catch (error: any) {
      console.error("AssignmentService.completeAssignment error:", error);
      return { success: false, message: error.message || "Error completing assignment" };
    }
  }
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
              points: true
            }
          },
          timeSlot: true
        }
      });

      // Create notification for user
      await prisma.userNotification.create({
        data: {
          userId: assignment.userId,
          type: "ASSIGNMENT_VERIFIED",
          title: data.verified ? "Task Verified" : "Task Rejected",
          message: data.verified 
            ? `Your task "${assignment.task.title}" has been verified!`
            : `Your task "${assignment.task.title}" needs revision.`,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            verified: data.verified,
            adminNotes: data.adminNotes
          },
          read: false
        }
      });

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
          rotationWeek: assignment.rotationWeek
        };
      });

      return {
        success: true,
        message: "Assignments retrieved successfully",
        assignments: formattedAssignments,
        total,
        filters
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
