// controllers/assignment.controller.ts - NEW FILE
import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { AssignmentService } from "../services/assignment.services";
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

}