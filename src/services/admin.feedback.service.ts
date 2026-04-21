import prisma from "../prisma";
import { UserNotificationService } from "./user.notification.services";
import { emitToUser, emitToUsers } from '../socket';

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
    console.log('📊 [SERVICE] getFeedback - START');
    console.log('  Filters:', JSON.stringify(filters, null, 2));
    
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
      console.log(`  📄 Pagination: page=${page}, limit=${limit}, skip=${skip}`);

      const where: any = {};

      if (status) {
        where.status = status;
        console.log(`  🏷️ Status filter: ${status}`);
      }
      if (type) {
        where.type = type;
        console.log(`  🏷️ Type filter: ${type}`);
      }
      if (search) {
        where.OR = [
          { message: { contains: search } },
          { user: { fullName: { contains: search } } },
          { user: { email: { contains: search } } }
        ];
        console.log(`  🔍 Search filter: ${search}`);
      }

      console.log('  🔍 Executing database queries...');
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

      console.log(`  ✅ Found ${feedback.length} feedback items (total: ${total})`);
      console.log('📊 [SERVICE] getFeedback - END');

      return {
        success: true,
        message: "Feedback retrieved successfully",
        data: { feedback, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }
      };

    } catch (error: any) {
      console.error('💥 [SERVICE] getFeedback ERROR:', error);
      return { success: false, message: error.message || "Failed to retrieve feedback" };
    }
  }

  // ========== GET SINGLE FEEDBACK DETAILS ==========
  static async getFeedbackById(feedbackId: string) {
    console.log(`🔍 [SERVICE] getFeedbackById - ID: ${feedbackId}`);
    
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
        console.log(`❌ [SERVICE] Feedback not found: ${feedbackId}`);
        return { success: false, message: "Feedback not found" };
      }

      console.log(`✅ [SERVICE] Feedback found: ${feedbackId}, type: ${feedback.type}`);
      return { success: true, message: "Feedback details retrieved", data: feedback };

    } catch (error: any) {
      console.error(`💥 [SERVICE] getFeedbackById ERROR for ${feedbackId}:`, error);
      return { success: false, message: error.message || "Failed to retrieve feedback" };
    }
  }

  // ========== UPDATE FEEDBACK STATUS (WITH REAL-TIME) ==========
  static async updateFeedbackStatus(feedbackId: string, status: string, adminId?: string) {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔄🔄🔄 [SERVICE] updateFeedbackStatus - START 🔄🔄🔄');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  📝 Input: feedbackId=${feedbackId}, newStatus=${status}, adminId=${adminId}`);
    
    try {
      // Get original feedback for old status
      console.log('  🔍 Step 1: Fetching original feedback...');
      const originalFeedback = await prisma.feedback.findUnique({
        where: { id: feedbackId },
        include: { user: { select: { id: true, fullName: true, email: true } } }
      });

      if (!originalFeedback) {
        console.log(`  ❌ Feedback not found: ${feedbackId}`);
        return { success: false, message: "Feedback not found" };
      }

      const oldStatus = originalFeedback.status;
      console.log(`  ✅ Original feedback found:`);
      console.log(`     - oldStatus: ${oldStatus}`);
      console.log(`     - userId: ${originalFeedback.userId}`);
      console.log(`     - user: ${originalFeedback.user?.fullName}`);
      console.log(`     - message preview: ${originalFeedback.message?.substring(0, 50)}`);

      // Update feedback
      console.log('  🔄 Step 2: Updating feedback status in database...');
      const feedback = await prisma.feedback.update({
        where: { id: feedbackId },
        data: { status, updatedAt: new Date() },
        include: {
          user: { select: { id: true, fullName: true, email: true, avatarUrl: true } }
        }
      });
      console.log(`  ✅ Database updated: status changed from ${oldStatus} to ${feedback.status}`);

      // Get admin info if provided
      let adminName = 'System';
      if (adminId) {
        console.log(`  🔍 Step 3: Fetching admin info for ID: ${adminId}...`);
        const admin = await prisma.systemAdmin.findUnique({
          where: { id: adminId },
          select: { fullName: true }
        });
        if (admin) {
          adminName = admin.fullName;
          console.log(`  ✅ Admin found: ${adminName}`);
        } else {
          console.log(`  ⚠️ Admin not found for ID: ${adminId}`);
        }
      } else {
        console.log(`  ⚠️ No adminId provided, using "System" as admin name`);
      }

      // ========== NOTIFY USER ==========
      console.log('  🔔 Step 4: Creating user notification...');
      await UserNotificationService.createNotification({
        userId: feedback.userId,
        type: "FEEDBACK_STATUS_UPDATE",
        title: `Feedback ${status}`,
        message: `Your feedback "${feedback.message.substring(0, 50)}..." has been marked as ${status} by ${adminName}`,
        data: {
          feedbackId: feedback.id,
          oldStatus,
          newStatus: status,
          updatedBy: adminId || 'SYSTEM',
          updatedByName: adminName
        }
      });
      console.log(`  ✅ User notification created for user: ${feedback.userId}`);

      // ========== EMIT REAL-TIME SOCKET EVENT TO USER ==========
      console.log('  📡 Step 5: Emitting socket event to user...');
      const userPayload = {
        feedbackId: feedback.id,
        oldStatus,
        newStatus: status,
        updatedBy: adminId || 'SYSTEM',
        updatedByName: adminName,
        updatedAt: new Date()
      };
      console.log(`  📤 Emitting to user ${feedback.userId}:`, userPayload);
      emitToUser(feedback.userId, 'feedback:status', userPayload);
      console.log(`  ✅ Emitted to user`);

      // ========== NOTIFY OTHER ADMINS ==========
      console.log('  📡 Step 6: Notifying other admins...');
      const otherAdmins = await prisma.systemAdmin.findMany({
        where: { id: { not: adminId || '' }, isActive: true },
        select: { id: true }
      });
      console.log(`  👥 Found ${otherAdmins.length} other admins`);

      if (otherAdmins.length > 0) {
        const adminIds = otherAdmins.map(a => a.id);
        const adminPayload = {
          feedbackId: feedback.id,
          userName: feedback.user?.fullName,
          oldStatus,
          newStatus: status,
          updatedBy: adminId || 'SYSTEM',
          updatedByName: adminName,
          updatedAt: new Date()
        };
        console.log(`  📤 Emitting to ${adminIds.length} admins:`, adminPayload);
        emitToUsers(adminIds, 'feedback:status', adminPayload);
        console.log(`  ✅ Emitted to admins`);
      } else {
        console.log(`  ℹ️ No other admins to notify`);
      }

      console.log(`═══════════════════════════════════════════════════`);
      console.log(`✅✅✅ SUCCESS: ${adminName} updated feedback ${feedbackId}`);
      console.log(`     Status: ${oldStatus} → ${status}`);
      console.log(`═══════════════════════════════════════════════════`);

      return {
        success: true,
        message: `Feedback status updated to ${status}`,
        data: feedback
      };

    } catch (error: any) {
      console.error('💥💥💥 [SERVICE] updateFeedbackStatus ERROR:', error);
      console.log('═══════════════════════════════════════════════════');
      return { success: false, message: error.message || "Failed to update feedback status" };
    }
  }

  // ========== DELETE FEEDBACK (WITH REAL-TIME) ==========
  static async deleteFeedback(feedbackId: string, adminId: string) {
    console.log('═══════════════════════════════════════════════════');
    console.log('🗑️🗑️🗑️ [SERVICE] deleteFeedback - START 🗑️🗑️🗑️');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  📝 Input: feedbackId=${feedbackId}, adminId=${adminId}`);
    
    try {
      // Get feedback before deleting
      console.log('  🔍 Step 1: Fetching feedback to delete...');
      const feedback = await prisma.feedback.findUnique({
        where: { id: feedbackId },
        include: { user: { select: { id: true, fullName: true } } }
      });

      if (!feedback) {
        console.log(`  ❌ Feedback not found: ${feedbackId}`);
        return { success: false, message: "Feedback not found" };
      }

      console.log(`  ✅ Feedback found:`);
      console.log(`     - userId: ${feedback.userId}`);
      console.log(`     - user: ${feedback.user?.fullName}`);
      console.log(`     - type: ${feedback.type}`);
      console.log(`     - message: ${feedback.message?.substring(0, 50)}`);

      // Delete feedback
      console.log('  🗑️ Step 2: Deleting feedback from database...');
      await prisma.feedback.delete({ where: { id: feedbackId } });
      console.log(`  ✅ Feedback deleted from database`);

      // Get admin info
      console.log(`  🔍 Step 3: Fetching admin info for ID: ${adminId}...`);
      const admin = await prisma.systemAdmin.findUnique({
        where: { id: adminId },
        select: { fullName: true }
      });
      const adminName = admin?.fullName || 'Admin';
      console.log(`  ✅ Admin: ${adminName}`);

      // ========== NOTIFY USER ==========
      console.log('  🔔 Step 4: Creating user notification for deletion...');
      await UserNotificationService.createNotification({
        userId: feedback.userId,
        type: "FEEDBACK_DELETED",
        title: "Feedback Deleted",
        message: `Your feedback has been deleted by an administrator.`,
        data: { feedbackId, type: feedback.type }
      });
      console.log(`  ✅ User notification created for user: ${feedback.userId}`);

      // ========== EMIT REAL-TIME SOCKET EVENT ==========
      console.log('  📡 Step 5: Emitting deletion socket event to user...');
      const userPayload = {
        feedbackId: feedback.id,
        type: feedback.type,
        deletedBy: adminId,
        deletedByName: adminName,
        deletedAt: new Date()
      };
      console.log(`  📤 Emitting to user ${feedback.userId}:`, userPayload);
      emitToUser(feedback.userId, 'feedback:deleted', userPayload);
      console.log(`  ✅ Emitted to user`);

      // ========== NOTIFY OTHER ADMINS ==========
      console.log('  📡 Step 6: Notifying other admins about deletion...');
      const otherAdmins = await prisma.systemAdmin.findMany({
        where: { id: { not: adminId }, isActive: true },
        select: { id: true }
      });
      console.log(`  👥 Found ${otherAdmins.length} other admins`);

      if (otherAdmins.length > 0) {
        const adminIds = otherAdmins.map(a => a.id);
        const adminPayload = {
          feedbackId: feedback.id,
          userName: feedback.user?.fullName,
          type: feedback.type,
          deletedBy: adminId,
          deletedByName: adminName,
          deletedAt: new Date()
        };
        console.log(`  📤 Emitting to ${adminIds.length} admins:`, adminPayload);
        emitToUsers(adminIds, 'feedback:deleted', adminPayload);
        console.log(`  ✅ Emitted to admins`);
      } else {
        console.log(`  ℹ️ No other admins to notify`);
      }

      console.log(`═══════════════════════════════════════════════════`);
      console.log(`✅✅✅ SUCCESS: Admin ${adminName} deleted feedback ${feedbackId}`);
      console.log(`═══════════════════════════════════════════════════`);

      return { success: true, message: "Feedback deleted successfully" };

    } catch (error: any) {
      console.error('💥💥💥 [SERVICE] deleteFeedback ERROR:', error);
      console.log('═══════════════════════════════════════════════════');
      return { success: false, message: error.message || "Failed to delete feedback" };
    }
  }

  // ========== GET FEEDBACK STATS ==========
  static async getFeedbackStats() {
    console.log('📊 [SERVICE] getFeedbackStats - START');
    
    try {
      console.log('  🔍 Counting feedback by status...');
      const [open, inProgress, resolved, closed, total] = await Promise.all([
        prisma.feedback.count({ where: { status: "OPEN" } }),
        prisma.feedback.count({ where: { status: "IN_PROGRESS" } }),
        prisma.feedback.count({ where: { status: "RESOLVED" } }),
        prisma.feedback.count({ where: { status: "CLOSED" } }),
        prisma.feedback.count()
      ]);

      console.log(`  📊 Status counts: OPEN=${open}, IN_PROGRESS=${inProgress}, RESOLVED=${resolved}, CLOSED=${closed}, TOTAL=${total}`);

      console.log('  🔍 Grouping by type...');
      const byType = await prisma.feedback.groupBy({
        by: ['type'],
        _count: true
      });

      const typeStats: Record<string, number> = {};
      byType.forEach(item => { 
        typeStats[item.type] = item._count;
        console.log(`     - ${item.type}: ${item._count}`);
      });

      console.log('📊 [SERVICE] getFeedbackStats - END');

      return {
        success: true,
        message: "Feedback stats retrieved",
        data: { total, open, inProgress, resolved, closed, byType: typeStats }
      };

    } catch (error: any) {
      console.error('💥 [SERVICE] getFeedbackStats ERROR:', error);
      return { success: false, message: error.message || "Failed to retrieve stats" };
    }
  }

  // ========== GET FILTERED FEEDBACK STATS ==========
  static async getFilteredFeedbackStats(filters?: { status?: string, type?: string, search?: string }) {
    console.log('📊 [SERVICE] getFilteredFeedbackStats - START');
    console.log('  Filters:', filters);
    
    try {
      const where: any = {};
      
      // Build the base where clause WITHOUT status filter for the breakdown
      const baseWhere: any = {};
      
      if (filters?.type) {
        baseWhere.type = filters.type;
        console.log(`  🏷️ Type filter: ${filters.type}`);
      }
      
      if (filters?.search && filters.search.trim()) {
        console.log(`  🔍 Search filter: ${filters.search}`);
        const matchingUsers = await prisma.user.findMany({
          where: {
            OR: [
              { fullName: { contains: filters.search } },
              { email: { contains: filters.search } }
            ]
          },
          select: { id: true }
        });
        
        const userIds = matchingUsers.map(u => u.id);
        console.log(`  👥 Found ${userIds.length} matching users`);
        
        baseWhere.OR = [
          { message: { contains: filters.search } },
          ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : [])
        ];
      }

      // For the main where clause (used for total), apply status filter if present
      const mainWhere = { ...baseWhere };
      if (filters?.status) {
        mainWhere.status = filters.status;
        console.log(`  🏷️ Status filter applied to mainWhere: ${filters.status}`);
      }

      console.log('  📊 BaseWhere (for breakdown):', JSON.stringify(baseWhere));
      console.log('  📊 MainWhere (for total):', JSON.stringify(mainWhere));

      // Get total count with status filter applied
      const total = await prisma.feedback.count({ where: mainWhere });
      console.log(`  📊 Total with status filter: ${total}`);

      // Get breakdown counts WITHOUT status filter
      console.log('  🔍 Getting breakdown counts...');
      const [open, inProgress, resolved, closed] = await Promise.all([
        prisma.feedback.count({ where: { ...baseWhere, status: "OPEN" } }),
        prisma.feedback.count({ where: { ...baseWhere, status: "IN_PROGRESS" } }),
        prisma.feedback.count({ where: { ...baseWhere, status: "RESOLVED" } }),
        prisma.feedback.count({ where: { ...baseWhere, status: "CLOSED" } })
      ]);

      console.log(`  📊 Breakdown: OPEN=${open}, IN_PROGRESS=${inProgress}, RESOLVED=${resolved}, CLOSED=${closed}`);

      console.log('  🔍 Getting type breakdown...');
      const byType = await prisma.feedback.groupBy({
        by: ['type'],
        where: mainWhere,
        _count: true
      });

      const typeStats: Record<string, number> = {};
      byType.forEach(item => { 
        typeStats[item.type] = item._count;
        console.log(`     - ${item.type}: ${item._count}`);
      });

      console.log('📊 [SERVICE] getFilteredFeedbackStats - END');

      return {
        success: true,
        message: "Filtered feedback stats retrieved",
        data: { total, open, inProgress, resolved, closed, byType: typeStats }
      };

    } catch (error: any) {
      console.error('💥 [SERVICE] getFilteredFeedbackStats ERROR:', error);
      return { success: false, message: error.message || "Failed to retrieve filtered stats" };
    }
  }
}