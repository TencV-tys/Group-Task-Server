import prisma from "../prisma";
import { UserNotificationService } from "./user.notification.services";

export class FeedbackService {
  
  // Submit feedback
  static async submitFeedback(
    userId: string,
    data: {
      type: string;
      message: string;
      category?: string;
    } 
  ) {
    try {
      // Validate
      if (!data.type) {
        return {
          success: false,
          message: "Feedback type is required"
        };
      }

      if (!data.message?.trim()) {
        return {
          success: false,
          message: "Feedback message is required"
        };
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true }
      });

      if (!user) {
        return {
          success: false,
          message: "User not found"
        };
      }

      // Create feedback
      const feedback = await prisma.feedback.create({
        data: {
          userId,
          type: data.type,
          message: data.message.trim(),
          status: "OPEN",
          category: data.category?.trim() || null
        }
      });

      // Create notification for user
      await UserNotificationService.createNotification({
        userId,
        type: "FEEDBACK_SUBMITTED",
        title: "Feedback Received",
        message: `Thank you for your ${data.type} feedback! We'll review it soon.`,
        data: {
          feedbackId: feedback.id,
          type: data.type
        }
      });

      return {
        success: true,
        message: "Feedback submitted successfully",
        feedback: {
          id: feedback.id,
          type: feedback.type,
          message: feedback.message,
          status: feedback.status,
          category: feedback.category,
          createdAt: feedback.createdAt
        }
      };

    } catch (error: any) {
      console.error("FeedbackService.submitFeedback error:", error);
      return {
        success: false,
        message: error.message || "Error submitting feedback"
      };
    }
  }

  // Get user's feedback
  static async getUserFeedback(userId: string, page: number = 1, limit: number = 20) {
    try {
      const skip = (page - 1) * limit;

      const [feedback, total] = await Promise.all([
        prisma.feedback.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            type: true,
            message: true,
            status: true,
            category: true,
            createdAt: true,
            updatedAt: true
          }
        }),
        prisma.feedback.count({
          where: { userId }
        })
      ]);

      return {
        success: true,
        feedback,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error: any) {
      console.error("FeedbackService.getUserFeedback error:", error);
      return {
        success: false,
        message: error.message,
        feedback: []
      };
    }
  }

  // Get single feedback
  static async getFeedbackDetails(feedbackId: string, userId: string) {
    try {
      const feedback = await prisma.feedback.findFirst({
        where: {
          id: feedbackId,
          userId
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
        feedback
      };

    } catch (error: any) {
      console.error("FeedbackService.getFeedbackDetails error:", error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Delete feedback
  static async deleteFeedback(feedbackId: string, userId: string) {
    try {
      const feedback = await prisma.feedback.findFirst({
        where: {
          id: feedbackId,
          userId
        }
      });

      if (!feedback) {
        return {
          success: false,
          message: "Feedback not found"
        };
      }

      await prisma.feedback.delete({
        where: { id: feedbackId }
      });

      return {
        success: true,
        message: "Feedback deleted successfully"
      };

    } catch (error: any) {
      console.error("FeedbackService.deleteFeedback error:", error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Get feedback stats for user
 static async getUserFeedbackStats(userId: string) {
  try {
    const [total, open, resolved, byType] = await Promise.all([
      prisma.feedback.count({ where: { userId } }),
      prisma.feedback.count({ where: { userId, status: "OPEN" } }),
      prisma.feedback.count({ where: { userId, status: "RESOLVED" } }),
      prisma.feedback.groupBy({
        by: ['type'],
        where: { userId },
        _count: {
          type: true
        }
      })
    ]);

    // Create empty object with proper type
    const byTypeStats: Record<string, number> = {};
    
    // Fill it manually
    for (const item of byType) {
      byTypeStats[item.type] = item._count.type;
    }

    return {
      success: true,
      stats: {
        total,
        open,
        resolved,
        byType: byTypeStats
      }
    };

  } catch (error: any) {
    console.error("FeedbackService.getUserFeedbackStats error:", error);
    return {
      success: false,
      message: error.message
    };
  }
}
// Add this to your FeedbackService class

// Update feedback (user can update their own feedback)
static async updateFeedback(
  feedbackId: string,
  userId: string,
  data: {
    type?: string;
    message?: string;
    category?: string | null;
  }
) {
  try {
    // Check if feedback exists and belongs to user
    const existingFeedback = await prisma.feedback.findFirst({
      where: {
        id: feedbackId,
        userId
      }
    });

    if (!existingFeedback) {
      return {
        success: false,
        message: "Feedback not found or you don't have permission to update it"
      };
    }

    // Don't allow updating if feedback is already RESOLVED or CLOSED
    if (existingFeedback.status === "RESOLVED" || existingFeedback.status === "CLOSED") {
      return {
        success: false,
        message: "Cannot update feedback that is already resolved or closed"
      };
    }

    // Prepare update data
    const updateData: any = {};
    
    if (data.type !== undefined) {
      if (!data.type) {
        return { success: false, message: "Feedback type cannot be empty" };
      }
      updateData.type = data.type;
    }
    
    if (data.message !== undefined) {
      if (!data.message?.trim()) {
        return { success: false, message: "Feedback message cannot be empty" };
      }
      updateData.message = data.message.trim();
    }
    
    if (data.category !== undefined) {
      updateData.category = data.category?.trim() || null;
    }

    // If nothing to update
    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        message: "No data to update"
      };
    }

    // Update feedback
    const updatedFeedback = await prisma.feedback.update({
      where: { id: feedbackId },
      data: updateData
    });

    return {
      success: true,
      message: "Feedback updated successfully",
      feedback: {
        id: updatedFeedback.id,
        type: updatedFeedback.type,
        message: updatedFeedback.message,
        status: updatedFeedback.status,
        category: updatedFeedback.category,
        createdAt: updatedFeedback.createdAt,
        updatedAt: updatedFeedback.updatedAt
      }
    };

  } catch (error: any) {
    console.error("FeedbackService.updateFeedback error:", error);
    return {
      success: false,
      message: error.message || "Error updating feedback"
    };
  }
}

}