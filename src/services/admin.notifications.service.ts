// services/admin.feedback.service.ts - FULLY UPDATED (nothing removed)

import prisma from "../prisma";
import { UserNotificationService } from "./user.notification.services";
import { emitToUser } from '../socket';

export interface FeedbackFilters {
  status?: string;
  type?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class AdminFeedbackService {

  // ========== GET ALL FEEDBACK WITH FILTERS ==========
  static async getFeedback(filters: FeedbackFilters = {}) {
    try {
      const {
        status,
        type, 
        search,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      const skip = (page - 1) * limit;

      const where: any = {};

      if (status) where.status = status;
      if (type) where.type = type;
      if (search) {
        where.OR = [
          { message: { contains: search } },
          { user: { fullName: { contains: search } } },
          { user: { email: { contains: search } } }
        ];
      }

      const [feedback, total] = await Promise.all([
        prisma.feedback.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                avatarUrl: true
              }
            }
          }
        }),
        prisma.feedback.count({ where })
      ]);

      return {
        success: true,
        message: "Feedback retrieved successfully",
        data: {
          feedback,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      };

    } catch (error: any) {
      console.error("AdminFeedbackService.getFeedback error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve feedback"
      };
    }
  }

  // ========== GET SINGLE FEEDBACK DETAILS ==========
  static async getFeedbackById(feedbackId: string) {
    try {
      const feedback = await prisma.feedback.findUnique({
        where: { id: feedbackId },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true,
              role: true,
              createdAt: true
            }
          }
        }
      });

      if (!feedback) {
        return {
          success: false,
          message: "Feedback not found"
        };
      }

      return {
        success: true,
        message: "Feedback details retrieved",
        data: feedback
      };

    } catch (error: any) {
      console.error("AdminFeedbackService.getFeedbackById error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve feedback"
      };
    }
  }

  // ========== UPDATE FEEDBACK STATUS (WITH REAL-TIME) ==========
  static async updateFeedbackStatus(feedbackId: string, status: string, adminId: string) {
    try {
      const feedback = await prisma.feedback.update({
        where: { id: feedbackId },
        data: {
          status: status,
          updatedAt: new Date()
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          }
        }
      });

      const admin = await prisma.systemAdmin.findUnique({
        where: { id: adminId },
        select: { fullName: true }
      });

      await UserNotificationService.createNotification({
        userId: feedback.userId,
        type: "FEEDBACK_STATUS_UPDATE",
        title: `Feedback ${status}`,
        message: `Your feedback "${feedback.message.substring(0, 50)}..." has been marked as ${status}${admin ? ` by ${admin.fullName}` : ''}`,
        data: {
          feedbackId: feedback.id,
          status,
          updatedBy: adminId,
          updatedByName: admin?.fullName || 'Admin'
        }
      });

      emitToUser(
        feedback.userId,
        'FEEDBACK_STATUS_UPDATED',
        {
          feedbackId: feedback.id,
          status,
          updatedBy: adminId,
          updatedByName: admin?.fullName || 'Admin',
          updatedAt: new Date()
        }
      );

      return {
        success: true,
        message: `Feedback status updated to ${status}`,
        data: feedback
      };

    } catch (error: any) {
      console.error("AdminFeedbackService.updateFeedbackStatus error:", error);
      return {
        success: false,
        message: error.message || "Failed to update feedback status"
      };
    }
  }

  // ========== DELETE FEEDBACK ==========
  static async deleteFeedback(feedbackId: string) {
    try {
      const feedback = await prisma.feedback.findUnique({
        where: { id: feedbackId },
        include: { user: { select: { id: true, fullName: true } } }
      });

      await prisma.feedback.delete({
        where: { id: feedbackId }
      });

      if (feedback) {
        await UserNotificationService.createNotification({
          userId: feedback.userId,
          type: "FEEDBACK_DELETED",
          title: "Feedback Deleted",
          message: `Your feedback has been deleted by an administrator.`,
          data: {
            feedbackId: feedback.id,
            type: feedback.type
          }
        });
      }

      return {
        success: true,
        message: "Feedback deleted successfully"
      };

    } catch (error: any) {
      console.error("AdminFeedbackService.deleteFeedback error:", error);
      return {
        success: false,
        message: error.message || "Failed to delete feedback"
      };
    }
  }

  // ========== GET FEEDBACK STATS ==========
  static async getFeedbackStats() {
    try {
      const [open, inProgress, resolved, closed, total] = await Promise.all([
        prisma.feedback.count({ where: { status: "OPEN" } }),
        prisma.feedback.count({ where: { status: "IN_PROGRESS" } }),
        prisma.feedback.count({ where: { status: "RESOLVED" } }),
        prisma.feedback.count({ where: { status: "CLOSED" } }),
        prisma.feedback.count()
      ]);

      const byType = await prisma.feedback.groupBy({
        by: ['type'],
        _count: true
      });

      const typeStats: Record<string, number> = {};
      byType.forEach(item => {
        typeStats[item.type] = item._count;
      });

      return {
        success: true,
        message: "Feedback stats retrieved",
        data: {
          total,
          open,
          inProgress,
          resolved,
          closed,
          byType: typeStats
        }
      };

    } catch (error: any) {
      console.error("AdminFeedbackService.getFeedbackStats error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve stats"
      };
    }
  }

  // ========== GET FILTERED FEEDBACK STATS ==========
  static async getFilteredFeedbackStats(filters?: { status?: string, type?: string, search?: string }) {
    try {
      const where: any = {};
      
      if (filters?.status) where.status = filters.status;
      if (filters?.type) where.type = filters.type;
      if (filters?.search) {
        where.OR = [
          { message: { contains: filters.search, mode: 'insensitive' } },
          { user: { fullName: { contains: filters.search, mode: 'insensitive' } } },
          { user: { email: { contains: filters.search, mode: 'insensitive' } } }
        ];
      }

      console.log('📊 Filtered stats where clause:', JSON.stringify(where));

      const total = await prisma.feedback.count({ where });

      let open = 0, inProgress = 0, resolved = 0, closed = 0;

      if (filters?.status) {
        switch (filters.status) {
          case 'OPEN': open = total; break;
          case 'IN_PROGRESS': inProgress = total; break;
          case 'RESOLVED': resolved = total; break;
          case 'CLOSED': closed = total; break;
        }
      } else {
        [open, inProgress, resolved, closed] = await Promise.all([
          prisma.feedback.count({ where: { ...where, status: "OPEN" } }),
          prisma.feedback.count({ where: { ...where, status: "IN_PROGRESS" } }),
          prisma.feedback.count({ where: { ...where, status: "RESOLVED" } }),
          prisma.feedback.count({ where: { ...where, status: "CLOSED" } })
        ]);
      }

      console.log('📊 Filtered stats results:', { total, open, inProgress, resolved, closed });

      const byType = await prisma.feedback.groupBy({
        by: ['type'],
        where,
        _count: true
      });

      const typeStats: Record<string, number> = {};
      byType.forEach(item => {
        typeStats[item.type] = item._count;
      });

      return {
        success: true,
        message: "Filtered feedback stats retrieved",
        data: {
          total,
          open,
          inProgress,
          resolved,
          closed,
          byType: typeStats
        }
      };

    } catch (error: any) {
      console.error("AdminFeedbackService.getFilteredFeedbackStats error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve filtered stats"
      };
    }
  }
}