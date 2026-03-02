import prisma from "../prisma";

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

      // Build where clause
      const where: any = {};

      if (status) {
        where.status = status;
      }

      if (type) {
        where.type = type;
      }

      if (search) {
        where.OR = [
          { message: { contains: search } },
          { user: { fullName: { contains: search } } },
          { user: { email: { contains: search } } }
        ];
      }

      // Get feedback with user info
      const [feedback, total] = await Promise.all([
        prisma.feedback.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            [sortBy]: sortOrder
          },
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

  // ========== UPDATE FEEDBACK STATUS ==========
  static async updateFeedbackStatus(feedbackId: string, status: string) {
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

      // Create notification for user
      await prisma.userNotification.create({
        data: {
          userId: feedback.userId,
          type: "FEEDBACK_STATUS_UPDATE",
          title: `Feedback ${status}`,
          message: `Your feedback has been marked as ${status}`,
          data: {
            feedbackId: feedback.id,
            status
          }
        }
      });

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
      await prisma.feedback.delete({
        where: { id: feedbackId }
      });

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

      // Get counts by type
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
}