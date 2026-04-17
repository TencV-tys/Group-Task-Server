// services/feedback.services.ts - UPDATED to use SocketService

import prisma from "../prisma";
import { UserNotificationService } from "./user.notification.services";
import { SocketService } from "./socket.services"; // ✅ Import SocketService

export class FeedbackService {
  

  // ========== UPDATE FEEDBACK STATUS ==========
  static async updateFeedbackStatus(feedbackId: string, userId: string, status: string) {
    try {
      const existingFeedback = await prisma.feedback.findFirst({
        where: { id: feedbackId, userId }
      });

      if (!existingFeedback) {
        return { success: false, message: "Feedback not found or you don't have permission" };
      }

      const updatedFeedback = await prisma.feedback.update({
        where: { id: feedbackId },
        data: { status, updatedAt: new Date() }
      });

      // Notify admins about status change
      const admins = await prisma.systemAdmin.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      if (admins.length > 0) {
        // ✅ Use SocketService method
        await SocketService.emitFeedbackStatusChanged(
          admins.map(a => a.id),
          feedbackId,
          userId,
          existingFeedback.status,
          status
        );
      }

      return {
        success: true,
        message: "Feedback status updated successfully",
        feedback: updatedFeedback
      };

    } catch (error: any) {
      console.error("FeedbackService.updateFeedbackStatus error:", error);
      return { success: false, message: error.message || "Error updating feedback status" };
    }
  }

  // ========== GET USER'S FEEDBACK ==========
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
        prisma.feedback.count({ where: { userId } })
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
      return { success: false, message: error.message, feedback: [] };
    }
  }

  // ========== GET SINGLE FEEDBACK ==========
  static async getFeedbackDetails(feedbackId: string, userId: string) {
    try {
      const feedback = await prisma.feedback.findFirst({
        where: { id: feedbackId, userId }
      });

      if (!feedback) {
        return { success: false, message: "Feedback not found" };
      }

      return { success: true, feedback };

    } catch (error: any) {
      console.error("FeedbackService.getFeedbackDetails error:", error);
      return { success: false, message: error.message };
    }
  }

  // ========== GET USER FEEDBACK STATS ==========
  static async getUserFeedbackStats(userId: string) {
    try {
      const [total, open, resolved, byType] = await Promise.all([
        prisma.feedback.count({ where: { userId } }),
        prisma.feedback.count({ where: { userId, status: "OPEN" } }),
        prisma.feedback.count({ where: { userId, status: "RESOLVED" } }),
        prisma.feedback.groupBy({
          by: ['type'],
          where: { userId },
          _count: { type: true }
        })
      ]);

      const byTypeStats: Record<string, number> = {};
      for (const item of byType) {
        byTypeStats[item.type] = item._count.type;
      }

      return {
        success: true,
        stats: { total, open, resolved, byType: byTypeStats }
      };

    } catch (error: any) {
      console.error("FeedbackService.getUserFeedbackStats error:", error);
      return { success: false, message: error.message };
    }
  }

// services/feedback.services.ts - FULLY UPDATED submitFeedback

static async submitFeedback(
  userId: string,
  data: {
    type: string;
    message: string;
    category?: string;
  } 
) {
  try {
    if (!data.type) {
      return { success: false, message: "Feedback type is required" };
    }

    if (!data.message?.trim()) {
      return { success: false, message: "Feedback message is required" };
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true }
    });

    if (!user) {
      return { success: false, message: "User not found" };
    }

    const feedback = await prisma.feedback.create({
      data: {
        userId,
        type: data.type,
        message: data.message.trim(),
        status: "OPEN",
        category: data.category?.trim() || null
      }
    });

    // ✅ STEP 1: Send REAL-TIME event to the USER who submitted
    await SocketService.emitFeedbackCreatedForUser(userId, {
      id: feedback.id,
      type: feedback.type,
      message: feedback.message,
      status: feedback.status,
      category: feedback.category,
      createdAt: feedback.createdAt
    });

    // ✅ STEP 2: Create database notification for user (backup)
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

    // ✅ STEP 3: Notify ALL ADMINS via Socket
    const admins = await prisma.systemAdmin.findMany({
      where: { isActive: true },
      select: { id: true }
    });

    if (admins.length > 0) {
      await SocketService.emitNewFeedbackReceived(
        admins.map(a => a.id),
        feedback.id,
        data.type,
        user.fullName,
        data.message,
        feedback.createdAt
      );
    }

    console.log(`📬 Notified ${admins.length} admins and user ${userId} about new feedback`);

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
    return { success: false, message: error.message || "Error submitting feedback" };
  }
}

// ========== UPDATE FEEDBACK ==========
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
    const existingFeedback = await prisma.feedback.findFirst({
      where: { id: feedbackId, userId },
      include: { user: { select: { fullName: true } } }
    });

    if (!existingFeedback) {
      return { success: false, message: "Feedback not found or you don't have permission" };
    }

    if (existingFeedback.status === "RESOLVED" || existingFeedback.status === "CLOSED") {
      return { success: false, message: "Cannot update feedback that is already resolved or closed" };
    }

    const updateData: any = {};
    
    if (data.type !== undefined) {
      if (!data.type) return { success: false, message: "Feedback type cannot be empty" };
      updateData.type = data.type;
    }
    
    if (data.message !== undefined) {
      if (!data.message?.trim()) return { success: false, message: "Feedback message cannot be empty" };
      updateData.message = data.message.trim();
    }
    
    if (data.category !== undefined) {
      updateData.category = data.category?.trim() || null;
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, message: "No data to update" };
    }

    const updatedFeedback = await prisma.feedback.update({
      where: { id: feedbackId },
      data: updateData
    });

    // ✅ Send REAL-TIME update to USER
    await SocketService.emitFeedbackUpdatedForUser(userId, {
      id: updatedFeedback.id,
      type: updatedFeedback.type,
      message: updatedFeedback.message,
      status: updatedFeedback.status,
      category: updatedFeedback.category,
      updatedAt: updatedFeedback.updatedAt
    });

    // Notify user about update (database notification)
    await UserNotificationService.createNotification({
      userId,
      type: "FEEDBACK_UPDATED",
      title: "Feedback Updated",
      message: `Your feedback has been updated successfully.`,
      data: { feedbackId, changes: Object.keys(updateData) }
    });

    // Notify admins about update
    const admins = await prisma.systemAdmin.findMany({
      where: { isActive: true },
      select: { id: true }
    });

    if (admins.length > 0) {
      await SocketService.emitFeedbackUpdated(
        admins.map(a => a.id),
        feedbackId,
        userId,
        existingFeedback.user?.fullName || 'Unknown',
        updateData.type || existingFeedback.type,
        updateData.message || existingFeedback.message
      );
    }

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
    return { success: false, message: error.message || "Error updating feedback" };
  }
}

// ========== DELETE FEEDBACK ==========
static async deleteFeedback(feedbackId: string, userId: string) {
  try {
    const feedback = await prisma.feedback.findFirst({
      where: { id: feedbackId, userId },
      include: { user: { select: { fullName: true } } }
    });

    if (!feedback) {
      return { success: false, message: "Feedback not found" };
    }

    await prisma.feedback.delete({ where: { id: feedbackId } });

    // ✅ Send REAL-TIME delete to USER
    await SocketService.emitFeedbackDeletedForUser(userId, feedbackId);

    // Notify user about deletion (database notification)
    await UserNotificationService.createNotification({
      userId,
      type: "FEEDBACK_DELETED",
      title: "Feedback Deleted",
      message: `Your feedback has been deleted.`,
      data: { feedbackId, type: feedback.type }
    });

    // Notify admins about deletion
    const admins = await prisma.systemAdmin.findMany({
      where: { isActive: true },
      select: { id: true }
    });

    if (admins.length > 0) {
      await SocketService.emitFeedbackDeleted(
        admins.map(a => a.id),
        feedbackId,
        userId,
        feedback.user?.fullName || 'Unknown',
        feedback.type
      );
    }

    return { success: true, message: "Feedback deleted successfully" };

  } catch (error: any) {
    console.error("FeedbackService.deleteFeedback error:", error);
    return { success: false, message: error.message };
  }
}

} 