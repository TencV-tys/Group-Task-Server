import { Response } from 'express';
import { GroupActivityService } from '../services/group.activity.services';
import { UserAuthRequest } from '../middlewares/user.auth.middleware';

export class GroupActivityController {
  
  // Get group activity summary (Admin only)
  static async getActivitySummary(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await GroupActivityService.getGroupActivitySummary(groupId, userId);

      if (!result.success) {
        return res.status(403).json({
          success: false,
          message: result.message
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.data
      });

    } catch (error: any) {
      console.error("❌ Error in getActivitySummary:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get completion history (All members)
  static async getCompletionHistory(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { week, memberId, limit, offset } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await GroupActivityService.getCompletionHistory(
        groupId, 
        userId, 
        {
          week: week ? Number(week) : undefined,
          memberId: memberId as string,
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined
        }
      );

      if (!result.success) {
        return res.status(403).json({
          success: false,
          message: result.message
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.data
      });

    } catch (error: any) {
      console.error("❌ Error in getCompletionHistory:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get member contribution details
  static async getMemberContributions(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId, memberId } = req.params as { groupId: string; memberId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      if (!groupId || !memberId) {
        return res.status(400).json({
          success: false,
          message: "Group ID and Member ID are required"
        });
      }

      const result = await GroupActivityService.getMemberContributionDetails(
        groupId, 
        memberId, 
        userId
      );

      if (!result.success) {
        return res.status(403).json({
          success: false,
          message: result.message
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.data
      });

    } catch (error: any) {
      console.error("❌ Error in getMemberContributions:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get task completion history
  static async getTaskCompletionHistory(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { taskId, week } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await GroupActivityService.getTaskCompletionHistory(
        groupId, 
        userId, 
        {
          taskId: taskId as string,
          week: week ? Number(week) : undefined
        }
      );

      if (!result.success) {
        return res.status(403).json({
          success: false,
          message: result.message
        });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.data
      });

    } catch (error: any) {
      console.error("❌ Error in getTaskCompletionHistory:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}