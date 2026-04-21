// services/admin.notifications.service.ts - FULLY UPDATED WITH SOCKET EVENTS

import prisma from "../prisma";
import { SocketService } from "./socket.services";

export interface NotificationFilters {
  read?: boolean;
  priority?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class AdminNotificationsService {
  
  // ========== GET ALL NOTIFICATIONS ==========
  static async getNotifications(adminId: string, filters: NotificationFilters = {}) {
    try {
      const {
        read, 
        priority,
        search,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {
        adminId
      };

      if (read !== undefined) {
        where.read = read;
      }

      if (priority) {
        where.priority = priority;
      }

      if (search) {
        where.OR = [
          { title: { contains: search } },
          { message: { contains: search } }
        ];
      }

      // Get notifications
      const [notifications, total, unreadCount] = await Promise.all([
        prisma.adminNotification.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            [sortBy]: sortOrder
          }
        }),
        prisma.adminNotification.count({ where }),
        prisma.adminNotification.count({ 
          where: { 
            adminId,
            read: false 
          } 
        })
      ]);

      return {
        success: true,
        message: "Notifications retrieved successfully",
        data: {
          notifications,
          unreadCount,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      };

    } catch (error: any) {
      console.error("AdminNotificationsService.getNotifications error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve notifications"
      };
    }
  }

  // ========== GET SINGLE NOTIFICATION ==========
  static async getNotificationById(notificationId: string, adminId: string) {
    try {
      const notification = await prisma.adminNotification.findFirst({
        where: {
          id: notificationId,
          adminId
        }
      });

      if (!notification) {
        return {
          success: false,
          message: "Notification not found"
        };
      }

      return {
        success: true,
        message: "Notification retrieved successfully",
        data: notification
      };

    } catch (error: any) {
      console.error("AdminNotificationsService.getNotificationById error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve notification"
      };
    }
  }

  // ========== MARK NOTIFICATION AS READ ==========
  static async markAsRead(notificationId: string, adminId: string) {
    try {
      const notification = await prisma.adminNotification.updateMany({
        where: {
          id: notificationId,
          adminId
        },
        data: {
          read: true
        }
      });

      if (notification.count === 0) {
        return {
          success: false,
          message: "Notification not found"
        };
      }

      // Get updated notification
      const updated = await prisma.adminNotification.findUnique({
        where: { id: notificationId }
      });

      // ✅ Emit socket events for real-time updates
      await SocketService.emitAdminNotificationRead(adminId, notificationId);
      await SocketService.emitAdminNotificationCountRefresh(adminId);

      return {
        success: true,
        message: "Notification marked as read",
        data: updated
      };

    } catch (error: any) {
      console.error("AdminNotificationsService.markAsRead error:", error);
      return {
        success: false,
        message: error.message || "Failed to mark as read"
      };
    }
  }

  // ========== MARK ALL AS READ ==========
  static async markAllAsRead(adminId: string) {
    try {
      const result = await prisma.adminNotification.updateMany({
        where: {
          adminId,
          read: false
        },
        data: {
          read: true
        }
      });

      // ✅ Emit socket events for real-time updates
      await SocketService.emitAdminNotificationReadAll(adminId);
      await SocketService.emitAdminNotificationCountRefresh(adminId);

      return {
        success: true,
        message: `Marked ${result.count} notifications as read`,
        data: {
          count: result.count
        }
      };

    } catch (error: any) {
      console.error("AdminNotificationsService.markAllAsRead error:", error);
      return {
        success: false,
        message: error.message || "Failed to mark all as read"
      };
    }
  }

  // ========== DELETE NOTIFICATION ==========
  static async deleteNotification(notificationId: string, adminId: string) {
    try {
      const result = await prisma.adminNotification.deleteMany({
        where: {
          id: notificationId,
          adminId
        }
      });

      if (result.count === 0) {
        return {
          success: false,
          message: "Notification not found"
        };
      }

      // ✅ Emit socket events for real-time deletion
      await SocketService.emitAdminNotificationDeleted(adminId, notificationId);
      await SocketService.emitAdminNotificationCountRefresh(adminId);

      return {
        success: true,
        message: "Notification deleted successfully"
      };

    } catch (error: any) {
      console.error("AdminNotificationsService.deleteNotification error:", error);
      return {
        success: false,
        message: error.message || "Failed to delete notification"
      };
    }
  }

  // ========== DELETE ALL READ NOTIFICATIONS ==========
  static async deleteAllRead(adminId: string) {
    try {
      // First get the count
      const count = await prisma.adminNotification.count({
        where: {
          adminId,
          read: true
        }
      });

      const result = await prisma.adminNotification.deleteMany({
        where: {
          adminId,
          read: true
        }
      });

      // ✅ Emit socket events for real-time deletion
      await SocketService.emitAdminNotificationsDeletedRead(adminId, result.count);
      await SocketService.emitAdminNotificationCountRefresh(adminId);

      return {
        success: true,
        message: `Deleted ${result.count} read notifications`,
        data: {
          count: result.count
        }
      };

    } catch (error: any) {
      console.error("AdminNotificationsService.deleteAllRead error:", error);
      return {
        success: false,
        message: error.message || "Failed to delete read notifications"
      };
    }
  }

  // ========== GET UNREAD COUNT ==========
  static async getUnreadCount(adminId: string) {
    try {
      const count = await prisma.adminNotification.count({
        where: {
          adminId,
          read: false
        }
      });

      return {
        success: true,
        message: "Unread count retrieved",
        data: {
          count
        }
      };

    } catch (error: any) {
      console.error("AdminNotificationsService.getUnreadCount error:", error);
      return {
        success: false,
        message: error.message || "Failed to get unread count"
      };
    }
  }

  // ========== CREATE NOTIFICATION (for internal use) ==========
  static async createNotification(data: {
    adminId: string;
    type: string;
    title: string;
    message: string;
    priority?: string;
    data?: any;
  }) {
    try {
      const notification = await prisma.adminNotification.create({
        data: {
          adminId: data.adminId,
          type: data.type,
          title: data.title,
          message: data.message,
          priority: data.priority || 'NORMAL',
          data: data.data || {},
          read: false
        }
      });

      // ✅ Emit socket event for new notification
      await SocketService.emitAdminNotificationNew(
        data.adminId,
        notification.id,
        data.type,
        data.title,
        data.message,
        data.data
      );
      
      // Also refresh count
      await SocketService.emitAdminNotificationCountRefresh(data.adminId);

      return {
        success: true,
        message: "Notification created",
        data: notification
      };

    } catch (error: any) {
      console.error("AdminNotificationsService.createNotification error:", error);
      return {
        success: false,
        message: error.message || "Failed to create notification"
      };
    }
  }

  // ========== DELETE ALL NOTIFICATIONS (Admin only) ==========
  static async deleteAllNotifications(adminId: string) {
    try {
      const result = await prisma.adminNotification.deleteMany({
        where: {
          adminId
        }
      });

      // ✅ Emit socket events for real-time deletion
      await SocketService.emitAdminNotificationsDeletedAll(adminId, result.count);
      await SocketService.emitAdminNotificationCountRefresh(adminId);

      return {
        success: true,
        message: `Deleted ${result.count} notifications`,
        data: {
          count: result.count
        }
      };

    } catch (error: any) {
      console.error("AdminNotificationsService.deleteAllNotifications error:", error);
      return {
        success: false,
        message: error.message || "Failed to delete all notifications"
      };
    }
  }
}