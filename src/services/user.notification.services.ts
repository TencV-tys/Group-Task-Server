import prisma from "../prisma";
import { SocketService } from "./socket.services";
export class UserNotificationService {
  
  // Create notification for a user
 static async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: any;
  }) {
    try {
      const notification = await prisma.userNotification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          data: data.data || {},
          read: false
        }
      });

      // 🔴 EMIT SOCKET EVENT FOR REAL-TIME NOTIFICATION
      await SocketService.emitNewNotification(
        data.userId,
        notification.id,
        data.type,
        data.title,
        data.message,
        data.data
      );

      return {
        success: true,
        notification
      };
    } catch (error: any) {
      console.error("Error creating notification:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get user's notifications
  static async getUserNotifications(userId: string, page: number = 1, limit: number = 20) {
    try {
      const skip = (page - 1) * limit;

      const [notifications, total, unreadCount] = await Promise.all([
        prisma.userNotification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit
        }),
        prisma.userNotification.count({
          where: { userId }
        }),
        prisma.userNotification.count({
          where: {
            userId,
            read: false
          }
        })
      ]);

      return {
        success: true,
        notifications,
        unreadCount,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error: any) {
      console.error("Error getting notifications:", error);
      return {
        success: false,
        message: error.message,
        notifications: [],
        unreadCount: 0
      };
    }
  }

  // Mark notification as read
  static async markAsRead(notificationId: string, userId: string) {
    try {
      const notification = await prisma.userNotification.findFirst({
        where: {
          id: notificationId,
          userId
        }
      });

      if (!notification) {
        return {
          success: false,
          message: "Notification not found"
        };
      }

      await prisma.userNotification.update({
        where: { id: notificationId },
        data: { read: true }
      });

      return {
        success: true,
        message: "Notification marked as read"
      };
    } catch (error: any) {
      console.error("Error marking notification as read:", error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Mark all notifications as read
  static async markAllAsRead(userId: string) {
    try {
      await prisma.userNotification.updateMany({
        where: {
          userId,
          read: false
        },
        data: { read: true }
      });

      return {
        success: true,
        message: "All notifications marked as read"
      };
    } catch (error: any) {
      console.error("Error marking all as read:", error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Delete a notification
  static async deleteNotification(notificationId: string, userId: string) {
    try {
      const notification = await prisma.userNotification.findFirst({
        where: {
          id: notificationId,
          userId
        }
      });

      if (!notification) {
        return {
          success: false,
          message: "Notification not found"
        };
      }

      await prisma.userNotification.delete({
        where: { id: notificationId }
      });

      return {
        success: true,
        message: "Notification deleted"
      };
    } catch (error: any) {
      console.error("Error deleting notification:", error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get unread count only
  static async getUnreadCount(userId: string) {
    try {
      const count = await prisma.userNotification.count({
        where: {
          userId,
          read: false
        }
      });

      return {
        success: true,
        count
      };
    } catch (error: any) {
      console.error("Error getting unread count:", error);
      return {
        success: false,
        count: 0
      };
    }
  }
}