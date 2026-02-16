import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { FeedbackService } from "../services/feedback.services";

export class FeedbackController {
  
  // Submit feedback
  static async submitFeedback(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { type, message, category } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      const result = await FeedbackService.submitFeedback(userId, {
        type,
        message,
        category
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.status(201).json({
        success: true,
        message: result.message,
        feedback: result.feedback
      });

    } catch (error: any) {
      console.error("Error in submitFeedback:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get my feedback
  static async getMyFeedback(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      const result = await FeedbackService.getUserFeedback(userId, page, limit);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        feedback: result.feedback,
        pagination: result.pagination
      });

    } catch (error: any) {
      console.error("Error in getMyFeedback:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get feedback details
  static async getFeedbackDetails(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { feedbackId } = req.params as {feedbackId:string};

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      const result = await FeedbackService.getFeedbackDetails(feedbackId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        feedback: result.feedback
      });

    } catch (error: any) {
      console.error("Error in getFeedbackDetails:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Delete my feedback
  static async deleteMyFeedback(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { feedbackId } = req.params as {feedbackId:string};

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      const result = await FeedbackService.deleteFeedback(feedbackId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message
      });

    } catch (error: any) {
      console.error("Error in deleteMyFeedback:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get my feedback stats
  static async getMyFeedbackStats(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      const result = await FeedbackService.getUserFeedbackStats(userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        stats: result.stats
      });

    } catch (error: any) {
      console.error("Error in getMyFeedbackStats:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}