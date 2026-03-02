import { Response } from "express";
import { AdminAuthRequest } from "../middlewares/admin.auth.middleware";
import { AdminFeedbackService } from "../services/admin.feedback.service";

export class AdminFeedbackController {
  
  // ========== GET ALL FEEDBACK ==========
  static async getFeedback(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const {
        status,
        type,
        search,
        page,
        limit,
        sortBy,
        sortOrder
      } = req.query;

      const filters = {
        status: status as string,
        type: type as string,
        search: search as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      };

      const result = await AdminFeedbackService.getFeedback(filters);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminFeedbackController.getFeedback error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET SINGLE FEEDBACK ==========
  static async getFeedbackById(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { feedbackId } = req.params as { feedbackId: string };

      const result = await AdminFeedbackService.getFeedbackById(feedbackId);

      if (!result.success) {
        return res.status(404).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminFeedbackController.getFeedbackById error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== UPDATE FEEDBACK STATUS ==========
  static async updateFeedbackStatus(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { feedbackId } = req.params as { feedbackId: string };
      const { status } = req.body; // Removed adminNotes

      if (!status) {
        return res.status(400).json({
          success: false,
          message: "Status is required"
        });
      }

      // ✅ FIXED: Only passing 2 arguments
      const result = await AdminFeedbackService.updateFeedbackStatus(feedbackId, status);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminFeedbackController.updateFeedbackStatus error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== ADD ADMIN REPLY - REMOVED ==========
  // This method is removed because your schema doesn't support admin replies

  // ========== DELETE FEEDBACK ==========
  static async deleteFeedback(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { feedbackId } = req.params as { feedbackId: string };

      const result = await AdminFeedbackService.deleteFeedback(feedbackId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminFeedbackController.deleteFeedback error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET FEEDBACK STATS ==========
  static async getFeedbackStats(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminFeedbackService.getFeedbackStats();

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminFeedbackController.getFeedbackStats error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}