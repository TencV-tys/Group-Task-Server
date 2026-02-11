// controllers/assignment.controller.ts - NEW FILE
import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { AssignmentService } from "../services/assignment.services";
import { TimeHelpers } from "../helpers/time.helpers";
import prisma from "../prisma";

export class AssignmentController {
  
  static async completeAssignment(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as { assignmentId: string };
      const { photoUrl, notes } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!assignmentId) {
        return res.status(400).json({
          success: false,
          message: "Assignment ID is required"
        });
      }

      const result = await AssignmentService.completeAssignment(
        assignmentId,
        userId,
        { photoUrl, notes }
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        assignment: result.assignment
      });

    } catch (error: any) {
      console.error("AssignmentController.completeAssignment error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  static async verifyAssignment(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as { assignmentId: string };
      const { verified, adminNotes } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!assignmentId) {
        return res.status(400).json({
          success: false,
          message: "Assignment ID is required"
        });
      }

      const result = await AssignmentService.verifyAssignment(
        assignmentId,
        userId,
        { verified, adminNotes }
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        assignment: result.assignment
      });

    } catch (error: any) {
      console.error("AssignmentController.verifyAssignment error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  static async getAssignmentDetails(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as { assignmentId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!assignmentId) {
        return res.status(400).json({
          success: false,
          message: "Assignment ID is required"
        });
      }

      const result = await AssignmentService.getAssignmentDetails(assignmentId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        assignment: result.assignment
      });

    } catch (error: any) {
      console.error("AssignmentController.getAssignmentDetails error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
    static async getUserAssignments(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { userId: targetUserId } = req.params as { userId: string };
      const { 
        status, // 'pending', 'completed', 'verified', 'rejected'
        week,
        limit = 20,
        offset = 0 
      } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      // Users can only view their own assignments unless they're admins
      // For now, let's just allow viewing own assignments
      const result = await AssignmentService.getUserAssignments(
        targetUserId,
        {
          status: status as string,
          week: week !== undefined ? Number(week) : undefined,
          limit: Number(limit),
          offset: Number(offset)
        }
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        assignments: result.assignments,
        total: result.total,
        filters: result.filters
      });

    } catch (error: any) {
      console.error("AssignmentController.getUserAssignments error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  static async getGroupAssignments(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { 
        status,
        week,
        userId: filterUserId,
        limit = 50,
        offset = 0 
      } = req.query;
 
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await AssignmentService.getGroupAssignments(
        groupId,
        userId,
        {
          status: status as string,
          week: week !== undefined ? Number(week) : undefined,
          userId: filterUserId as string,
          limit: Number(limit),
          offset: Number(offset)
        }
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        assignments: result.assignments,
        total: result.total,
        filters: result.filters
      });

    } catch (error: any) {
      console.error("AssignmentController.getGroupAssignments error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  static async checkSubmissionTime(req: UserAuthRequest, res: Response) {
    try {
      const { assignmentId } = req.params as {assignmentId:string};
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required" 
        });
      }
      
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          timeSlot: true,
          task: {
            include: {
              timeSlots: {
                orderBy: { sortOrder: 'asc' }
              }
            }
          }
        }
      });
      
      if (!assignment) {
        return res.status(404).json({ 
          success: false, 
          message: "Assignment not found" 
        });
      }
      
      // Check if assignment belongs to user
      if (assignment.userId !== userId) {
        return res.status(403).json({ 
          success: false, 
          message: "You can only check your own assignments" 
        });
      }
      
      const now = new Date();
      const validation = TimeHelpers.canSubmitAssignment(assignment, now);
      
      return res.status(200).json({
        success: true,
        message: "Submission time check completed",
        data: {
          assignmentId,
          canSubmit: validation.allowed,
          reason: validation.reason,
          timeLeft: validation.timeLeft,
          timeLeftText: validation.timeLeft ? TimeHelpers.getTimeLeftText(validation.timeLeft) : null,
          submissionStart: validation.submissionStart,
          gracePeriodEnd: validation.gracePeriodEnd,
          currentTime: now,
          dueDate: assignment.dueDate,
          timeSlot: assignment.timeSlot
        }
      });
      
    } catch (error: any) {
      console.error("AssignmentController.checkSubmissionTime error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Error checking submission time" 
      });
    }
  }
  
  // NEW: Get upcoming assignments with time info
  static async getUpcomingAssignments(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as {groupId:string};
      const { limit = 10 } = req.query;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required" 
        });
      }
      
      const now = new Date();
      const today = now.toDateString();
      
      const assignments = await prisma.assignment.findMany({
        where: {
          userId,
          task: groupId ? { groupId } : undefined,
          completed: false,
          dueDate: {
            gte: new Date(today) // Get today and future assignments
          }
        },
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
        take: Number(limit)
      });
      
      const assignmentsWithTimeInfo = assignments.map(assignment => {
        const dueDate = new Date(assignment.dueDate);
        const isToday = dueDate.toDateString() === today;
        const validation = isToday ? TimeHelpers.canSubmitAssignment(assignment, now) : null;
        
        return {
          ...assignment,
          isToday,
          canSubmit: validation?.allowed || false,
          timeLeft: validation?.timeLeft,
          timeLeftText: validation?.timeLeft ? TimeHelpers.getTimeLeftText(validation.timeLeft) : null,
          submissionInfo: validation
        };
      });
      
      return res.status(200).json({
        success: true,
        message: "Upcoming assignments retrieved",
        data: {
          assignments: assignmentsWithTimeInfo,
          currentTime: now,
          total: assignmentsWithTimeInfo.length
        }
      });
      
    } catch (error: any) {
      console.error("AssignmentController.getUpcomingAssignments error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Error retrieving upcoming assignments" 
      });
    }
  }

}