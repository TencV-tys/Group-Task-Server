// services/user.notification.services.ts - UPDATED with push notifications

import prisma from "../prisma";
import { SocketService } from "./socket.services";

export class UserNotificationService {
  
  // Send push notification to user's device
  private static async sendPushNotification(
    userId: string,
    title: string,
    message: string,
    data?: any
  ): Promise<void> {
    try {
      // Get user's active device tokens
      const devices = await prisma.userDevice.findMany({
        where: { 
          userId, 
          isActive: true 
        }
      });

      if (devices.length === 0) {
        console.log(`📱 No active devices found for user ${userId}`);
        return;
      }

      // Prepare notifications for all devices
      const notifications = devices.map((device:{expoPushToken:string}) => ({
        to: device.expoPushToken,
        sound: 'default',
        title: title,
        body: message,
        data: {
          ...data,
          notificationId: data?.notificationId,
          type: data?.type,
        },
        priority: 'high' as const,
      }));

      // Send to Expo push service
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notifications), 
      });

      const result = await response.json();
      
      // Handle invalid tokens (remove them)
      if (result.data) {
        for (let i = 0; i < result.data.length; i++) {
          const ticket = result.data[i];
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            // Remove invalid device
            await prisma.userDevice.updateMany({
              where: { expoPushToken: devices[i].expoPushToken },
              data: { isActive: false }
            });
            console.log(`📱 Removed invalid device token: ${devices[i].expoPushToken}`);
          }
        }
      }
      
      console.log(`📱 Push notification sent to ${devices.length} device(s) for user ${userId}`);
    } catch (error) {
      console.error("Error sending push notification:", error);
    }
  }
  
  // Create notification for a user - UPDATED with push
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

      // 📱 SEND PUSH NOTIFICATION (NEW!)
      await this.sendPushNotification(
        data.userId,
        data.title,
        data.message,
        {
          ...data.data,
          notificationId: notification.id,
          type: data.type,
        }
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