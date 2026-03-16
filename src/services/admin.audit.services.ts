// services/admin.audit.services.ts - COMPLETE UPDATED
import prisma from "../prisma";

export interface AuditLogFilters {
  adminId?: string;
  targetUserId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// Define which actions are important enough to log
const IMPORTANT_ACTIONS = [
  // ===== REPORT ACTIONS =====
  'UPDATE_REPORT_STATUS',
  'BULK_UPDATE_REPORTS',
  
  // ===== NOTIFICATION ACTIONS =====
  'MARK_NOTIFICATION_READ',
  'MARK_ALL_NOTIFICATIONS_READ',
  'DELETE_NOTIFICATION',
  'DELETE_ALL_READ_NOTIFICATIONS',
  
  // ===== GROUP ACTIONS =====
  'DELETE_GROUP',
  'APPLY_GROUP_ACTION',
  'GROUP_SOFT_DELETED',
  'GROUP_RESTORED',
  'GROUP_HARD_DELETED',
  'ADMIN_REMOVE_GROUP_MEMBER',
  'ADMIN_BULK_DELETE_GROUPS',
  
  // ===== FEEDBACK ACTIONS =====
  'UPDATE_FEEDBACK_STATUS',
  'DELETE_FEEDBACK',
  
  // ===== USER ACTIONS =====
  'ADMIN_UPDATE_USER',
  'ADMIN_DELETE_USER',
  'ADMIN_BULK_DELETE_USERS',
  'ADMIN_CHANGE_USER_ROLE',
  'ADMIN_TOGGLE_USER_STATUS',
  
  // ===== AUTH ACTIONS =====
  'ADMIN_LOGIN',
  'ADMIN_LOGOUT',
  'ADMIN_PASSWORD_CHANGE',
  
  // ===== AUDIT VIEW ACTIONS (Security sensitive) =====
  'ADMIN_VIEW_AUDIT_LOGS',
  'ADMIN_VIEW_AUDIT_STATISTICS',
  'ADMIN_VIEW_AUDIT_LOG_DETAIL'
];

// Skip logging these frequent view actions
const SKIP_ACTIONS = [
  // Group view actions
  'ADMIN_VIEWED_GROUPS',
  'ADMIN_VIEWED_GROUP_STATISTICS',
  'ADMIN_VIEWED_GROUP_DETAILS',
  
  // User view actions
  'ADMIN_VIEWED_USERS',
  'ADMIN_VIEWED_USER_DETAILS',
  
  // Feedback view actions
  'ADMIN_VIEWED_FEEDBACK',
  'ADMIN_VIEWED_FEEDBACK_STATS',
  
  // Report view actions
  'ADMIN_VIEWED_REPORTS',
  'ADMIN_VIEWED_REPORT_STATS',
  
  // Dashboard
  'ADMIN_VIEWED_DASHBOARD',
  
  // Notifications view
  'ADMIN_VIEWED_NOTIFICATIONS'
];

// ========== AUDIT QUEUE SYSTEM ==========
interface QueuedAuditLog {
  adminId: string;
  targetUserId?: string;
  action: string;
  details: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const auditQueue: QueuedAuditLog[] = [];
let isProcessing = false;
const MAX_QUEUE_SIZE = 2000;
let queueDroppedCount = 0;
let lastQueueWarningTime = 0;

// Failed request tracker to prevent abuse
const failedRequestTracker = new Map<string, { count: number; firstFailure: number }>();
const FAILED_REQUEST_LIMIT = 50;
const FAILED_REQUEST_WINDOW = 3600000;

// Process queue every 5 seconds
const QUEUE_PROCESS_INTERVAL = 5000;
const BATCH_SIZE = 50;

setInterval(() => {
  if (auditQueue.length > 0 && !isProcessing) {
    processAuditQueue();
  }
}, QUEUE_PROCESS_INTERVAL);

// Monitor queue size
setInterval(() => {
  const now = Date.now();
  if (auditQueue.length > 1000 && now - lastQueueWarningTime > 60000) {
    console.warn(`⚠️ AUDIT QUEUE WARNING: ${auditQueue.length} logs waiting, ${queueDroppedCount} dropped`);
    lastQueueWarningTime = now;
  }
}, 30000);

async function processAuditQueue() {
  if (auditQueue.length === 0 || isProcessing) return;
  
  isProcessing = true;
  const startTime = Date.now();
  const batch = auditQueue.splice(0, BATCH_SIZE);
  
  try {
    // Only log IMPORTANT actions from the queue
    const importantBatch = batch.filter(log => 
      IMPORTANT_ACTIONS.includes(log.action)
    );
    
    if (importantBatch.length > 0) {
      await prisma.adminAuditLog.createMany({
        data: importantBatch.map(log => ({
          adminId: log.adminId,
          targetUserId: log.targetUserId,
          action: log.action,
          details: log.details || {},
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          createdAt: log.createdAt
        })),
        skipDuplicates: true
      });
      
      const duration = Date.now() - startTime;
      console.log(`📊 Processed ${importantBatch.length} important audit logs (skipped ${batch.length - importantBatch.length} view logs) in ${duration}ms`);
    }
    
  } catch (error) {
    console.error('Failed to process audit batch:', error);
    queueDroppedCount += batch.length;
  }
  
  isProcessing = false;
}

export class AdminAuditService {
  
  // ========== TRACK FAILED REQUESTS ==========
  static trackFailedRequest(ipAddress: string, adminId?: string): boolean {
    try {
      const now = Date.now();
      const key = `${ipAddress}:${adminId || 'anonymous'}`;
      
      if (!failedRequestTracker.has(key)) {
        failedRequestTracker.set(key, { count: 1, firstFailure: now });
        return true;
      }
      
      const data = failedRequestTracker.get(key)!;
      
      if (now - data.firstFailure > FAILED_REQUEST_WINDOW) {
        failedRequestTracker.set(key, { count: 1, firstFailure: now });
        return true;
      }
      
      data.count += 1;
      
      if (data.count > FAILED_REQUEST_LIMIT) {
        console.warn(`🚫 IP ${ipAddress} has exceeded failed request limit (${data.count} failures)`);
        return false;
      }
      
      return true;
      
    } catch (error) {
      console.error('Error tracking failed request:', error);
      return true;
    }
  }

  // ========== CHECK IF IP IS BLOCKED ==========
  static isIpBlocked(ipAddress: string, adminId?: string): boolean {
    try {
      const key = `${ipAddress}:${adminId || 'anonymous'}`;
      const data = failedRequestTracker.get(key);
      
      if (!data) return false;
      
      const now = Date.now();
      
      if (now - data.firstFailure > FAILED_REQUEST_WINDOW) {
        failedRequestTracker.delete(key);
        return false;
      }
      
      return data.count > FAILED_REQUEST_LIMIT;
      
    } catch (error) {
      return false;
    }
  }

  // ========== CLEAR FAILED REQUEST TRACKER ==========
  static clearFailedTracker(ipAddress: string, adminId?: string) {
    const key = `${ipAddress}:${adminId || 'anonymous'}`;
    failedRequestTracker.delete(key);
  }

  // ========== GET QUEUE STATS ==========
  static getQueueStats() {
    return {
      queueSize: auditQueue.length,
      isProcessing,
      droppedCount: queueDroppedCount,
      failedTrackedCount: failedRequestTracker.size
    };
  }

  // ========== CREATE AUDIT LOG ==========
  static async createLog(
    adminId: string,
    action: string,
    data: {
      targetUserId?: string;
      details?: any;
      ipAddress?: string;
      userAgent?: string;
    }
  ) {
    try {
      // Skip view actions immediately
      if (SKIP_ACTIONS.includes(action)) {
        return null;
      }

      // Check if IP is blocked
      if (data.ipAddress && this.isIpBlocked(data.ipAddress, adminId)) {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`🚫 Blocked audit log from blocked IP: ${data.ipAddress}`);
        }
        return null;
      }

      // Rate limiting
      const now = Date.now();
      const recentLogs = auditQueue.filter(log => 
        log.action === action && 
        log.adminId === adminId &&
        now - log.createdAt.getTime() < 60000
      );
      
      if (recentLogs.length > 20 && IMPORTANT_ACTIONS.includes(action)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`⚠️ Rate limiting: Too many ${action} actions from admin ${adminId}`);
        }
        return null;
      }

      // Add to queue
      auditQueue.push({
        adminId,
        targetUserId: data.targetUserId,
        action,
        details: {
          ...data.details,
          body: data.details?.body && typeof data.details.body === 'object' 
            ? JSON.stringify(data.details.body).substring(0, 500) 
            : data.details?.body
        },
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        createdAt: new Date()
      });

      // Queue size warnings
      if (auditQueue.length > 1000) {
        if (now - lastQueueWarningTime > 60000) {
          console.warn(`⚠️ Audit queue size: ${auditQueue.length}`);
          lastQueueWarningTime = now;
        }
      }
      
      // Prevent memory issues
      if (auditQueue.length > MAX_QUEUE_SIZE) {
        const removed = auditQueue.splice(0, 300);
        queueDroppedCount += removed.length;
        console.error(`🔥 Audit queue too large - dropped ${removed.length} oldest logs (total dropped: ${queueDroppedCount})`);
      }

      return { queued: true };

    } catch (error) {
      console.error('Error queueing audit log:', error);
      return null;
    }
  }

  // ========== FORCE PROCESS QUEUE ==========
  static async forceProcessQueue(): Promise<void> {
    if (auditQueue.length === 0) return;
    
    console.log(`🔄 Force processing ${auditQueue.length} audit logs...`);
    
    while (auditQueue.length > 0) {
      const batch = auditQueue.splice(0, BATCH_SIZE);
      try {
        const importantBatch = batch.filter(log => IMPORTANT_ACTIONS.includes(log.action));
        if (importantBatch.length > 0) {
          await prisma.adminAuditLog.createMany({
            data: importantBatch.map(log => ({
              adminId: log.adminId,
              targetUserId: log.targetUserId,
              action: log.action,
              details: log.details || {},
              ipAddress: log.ipAddress,
              userAgent: log.userAgent,
              createdAt: log.createdAt
            })),
            skipDuplicates: true
          });
        }
      } catch (error) {
        console.error('Error in force processing:', error);
      }
    }
    
    console.log('✅ Force processing complete');
  }

  // ========== GET AUDIT LOGS ==========
  static async getLogs(filters: AuditLogFilters = {}) {
    try {
      const where: any = {};

      if (filters.adminId) where.adminId = filters.adminId;
      if (filters.targetUserId) where.targetUserId = filters.targetUserId;
      if (filters.action) where.action = filters.action;
      
      if (filters.startDate || filters.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
      }

      // Only show IMPORTANT actions
      where.action = { in: IMPORTANT_ACTIONS };

      console.log('📊 [AuditService] GetLogs where:', JSON.stringify(where, null, 2));

      const [logs, total] = await Promise.all([
        prisma.adminAuditLog.findMany({
          where,
          include: {
            admin: { select: { id: true, fullName: true, email: true } },
            targetUser: { select: { id: true, fullName: true, email: true, avatarUrl: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: filters.limit || 50,
          skip: filters.offset || 0
        }),
        prisma.adminAuditLog.count({ where })
      ]);

      console.log(`📊 [AuditService] Found ${logs.length} logs, total: ${total}`);

      return {
        success: true,
        logs,
        pagination: {
          total,
          limit: filters.limit || 50,
          offset: filters.offset || 0,
          hasMore: total > (filters.offset || 0) + (filters.limit || 50)
        }
      };

    } catch (error: any) {
      console.error('Error fetching audit logs:', error);
      return { success: false, message: error.message || 'Failed to fetch audit logs' };
    }
  }

  // ========== GET AUDIT LOG BY ID ==========
  static async getLogById(logId: string) {
    try {
      const log = await prisma.adminAuditLog.findUnique({
        where: { id: logId },
        include: {
          admin: { select: { id: true, fullName: true, email: true } },
          targetUser: { select: { id: true, fullName: true, email: true, avatarUrl: true } }
        }
      });

      if (!log) return { success: false, message: 'Audit log not found' };
      
      return { success: true, log };

    } catch (error: any) {
      console.error('Error fetching audit log:', error);
      return { success: false, message: error.message || 'Failed to fetch audit log' };
    }
  }

  // ========== GET AUDIT LOG STATISTICS ==========
  static async getStatistics(filters?: { startDate?: Date; endDate?: Date }) {
    try {
      console.log('📊 [AuditService] getStatistics called with filters:', filters);
      
      const where: any = {};
      
      // Apply date filters
      if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) {
          where.createdAt.gte = filters.startDate;
          console.log('📊 [AuditService] Start date:', filters.startDate);
        }
        if (filters.endDate) {
          where.createdAt.lte = filters.endDate;
          console.log('📊 [AuditService] End date:', filters.endDate);
        }
      }
      
      // DO NOT filter by IMPORTANT_ACTIONS for statistics
      // We want ALL actions in stats to show correct counts
      console.log('📊 [AuditService] Query where clause:', JSON.stringify(where, null, 2));

      // Get total count
      const totalLogs = await prisma.adminAuditLog.count({ where });
      console.log('📊 [AuditService] Total logs found:', totalLogs);

      // Get counts by action
      const logsByAction = await prisma.adminAuditLog.groupBy({ 
        by: ['action'], 
        _count: true, 
        where,
        orderBy: { _count: { action: 'desc' } }
      });
      console.log('📊 [AuditService] Actions found:', logsByAction.length);

      // Get counts by admin
      const logsByAdmin = await prisma.adminAuditLog.groupBy({ 
        by: ['adminId'], 
        _count: true, 
        where,
        orderBy: { _count: { adminId: 'desc' } },
        take: 5
      });

      // Get recent activity
      const recentActivity = await prisma.adminAuditLog.findMany({
        where,
        include: { 
          admin: { select: { fullName: true, email: true } },
          targetUser: { select: { fullName: true, email: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      const formattedByAction = logsByAction.map((item: any) => ({
        action: item.action,
        count: Number(item._count)
      }));

      const topAdmins = await Promise.all(
        logsByAdmin.map(async (item: any) => {
          try {
            const admin = await prisma.systemAdmin.findUnique({
              where: { id: item.adminId },
              select: { fullName: true, email: true }
            });
            return {
              adminId: item.adminId,
              adminName: admin?.fullName || 'Unknown Admin',
              adminEmail: admin?.email || '',
              count: Number(item._count)
            };
          } catch (error) {
            return {
              adminId: item.adminId,
              adminName: 'Unknown Admin',
              adminEmail: '',
              count: Number(item._count)
            };
          }
        })
      );

      const formattedRecentActivity = recentActivity.map(log => ({
        id: log.id,
        action: log.action,
        adminId: log.adminId,
        adminName: log.admin?.fullName || 'Unknown Admin',
        adminEmail: log.admin?.email || '',
        targetUserId: log.targetUserId || undefined,
        targetUserName: log.targetUser?.fullName,
        targetUserEmail: log.targetUser?.email,
        createdAt: log.createdAt,
        ipAddress: log.ipAddress,
        details: log.details as any
      }));

      const result = {
        success: true,
        statistics: {
          total: Number(totalLogs),
          byAction: formattedByAction,
          topAdmins,
          recentActivity: formattedRecentActivity
        }
      };

      console.log('📊 [AuditService] Statistics result:', result.statistics);
      return result;

    } catch (error: any) {
      console.error('Error fetching audit statistics:', error);
      return { success: false, message: error.message || 'Failed to fetch statistics' };
    }
  }

  // ========== CLEAN OLD LOGS ==========
  static async cleanOldLogs(daysToKeep: number = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await prisma.adminAuditLog.deleteMany({
        where: { 
          createdAt: { lt: cutoffDate }
        }
      });

      console.log(`🧹 Cleaned ${result.count} old audit logs older than ${daysToKeep} days`);
      return { success: true, deletedCount: result.count };

    } catch (error: any) {
      console.error('Error cleaning old logs:', error);
      return { success: false, message: error.message || 'Failed to clean old logs' };
    }
  }

  // ========== RESET FAILED TRACKER ==========
  static resetFailedTracker() {
    failedRequestTracker.clear();
    console.log('🔄 Failed request tracker cleared');
  }
}

// Export queue stats for monitoring
export const getAuditQueueStats = () => ({
  queueSize: auditQueue.length,
  isProcessing,
  droppedCount: queueDroppedCount,
  failedTrackedCount: failedRequestTracker.size
});