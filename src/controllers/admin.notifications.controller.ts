import { Response } from "express";
import { AdminAuthRequest } from "../middlewares/admin.auth.middleware";
import { AdminNotificationsService } from "../services/admin.notifications.service";

export class AdminNotificationsController {
  
  // ========== GET ALL NOTIFICATIONS ==========
  static async getNotifications(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const {
        read,
        priority,
        search,
        page,
        limit,
        sortBy,
        sortOrder
      } = req.query;

      const filters = {
        read: read === 'true' ? true : read === 'false' ? false : undefined,
        priority: priority as string,
        search: search as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      };

      const result = await AdminNotificationsService.getNotifications(adminId, filters);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminNotificationsController.getNotifications error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET SINGLE NOTIFICATION ==========
  static async getNotificationById(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { notificationId } = req.params as { notificationId: string };

      const result = await AdminNotificationsService.getNotificationById(notificationId, adminId);

      if (!result.success) {
        return res.status(404).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminNotificationsController.getNotificationById error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== MARK AS READ ==========
  static async markAsRead(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { notificationId } = req.params as { notificationId: string };

      const result = await AdminNotificationsService.markAsRead(notificationId, adminId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminNotificationsController.markAsRead error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== MARK ALL AS READ ==========
  static async markAllAsRead(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminNotificationsService.markAllAsRead(adminId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminNotificationsController.markAllAsRead error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== DELETE NOTIFICATION ==========
  static async deleteNotification(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { notificationId } = req.params as { notificationId: string };

      const result = await AdminNotificationsService.deleteNotification(notificationId, adminId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminNotificationsController.deleteNotification error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== DELETE ALL READ ==========
  static async deleteAllRead(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminNotificationsService.deleteAllRead(adminId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminNotificationsController.deleteAllRead error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET UNREAD COUNT ==========
  static async getUnreadCount(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminNotificationsService.getUnreadCount(adminId);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("AdminNotificationsController.getUnreadCount error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}