import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { UserNotificationService } from "../services/user.notification.services";
import prisma from "../prisma";

export class UserNotificationController { 
  
  // Get my notifications
  static async getMyNotifications(req: UserAuthRequest, res: Response) {
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

      const result = await UserNotificationService.getUserNotifications(userId, page, limit);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        notifications: result.notifications,
        unreadCount: result.unreadCount,
        pagination: result.pagination
      });

    } catch (error: any) {
      console.error("Error in getMyNotifications:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get unread count
  static async getUnreadCount(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      const result = await UserNotificationService.getUnreadCount(userId);

      return res.json({
        success: true,
        unreadCount: result.count
      });

    } catch (error: any) {
      console.error("Error in getUnreadCount:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Mark as read
  static async markAsRead(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { notificationId } = req.params as {notificationId:string};

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      const result = await UserNotificationService.markAsRead(notificationId, userId);

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
      console.error("Error in markAsRead:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Mark all as read
  static async markAllAsRead(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      const result = await UserNotificationService.markAllAsRead(userId);

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
      console.error("Error in markAllAsRead:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Delete notification
  static async deleteNotification(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { notificationId } = req.params as {notificationId:string};

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated"
        });
      }

      const result = await UserNotificationService.deleteNotification(notificationId, userId);

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
      console.error("Error in deleteNotification:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ✅ ADD THIS NEW METHOD - Register push token
  static async registerPushToken(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { expoPushToken, deviceType } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!expoPushToken) {
        return res.status(400).json({
          success: false,
          message: "Expo push token is required"
        });
      }

      // Upsert the device token
      await prisma.userDevice.upsert({
        where: { expoPushToken },
        update: {
          userId,
          deviceType: deviceType || 'unknown',
          isActive: true,
          lastUsedAt: new Date()
        },
        create: {
          userId,
          expoPushToken,
          deviceType: deviceType || 'unknown',
          isActive: true
        }
      });

      console.log(`📱 Push token registered for user ${userId}`);

      return res.status(200).json({
        success: true,
        message: "Push token registered successfully"
      });
    } catch (error: any) {
      console.error("Error registering push token:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to register push token"
      });
    }
  }

  static async deleteAllNotifications(req: UserAuthRequest, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
    }

    const result = await UserNotificationService.deleteAllNotifications(userId);

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
    console.error("Error in deleteAllNotifications:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}
}