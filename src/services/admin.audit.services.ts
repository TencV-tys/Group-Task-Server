// services/admin.audit.services.ts
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
  'ADMIN_DELETE_GROUP',
  'ADMIN_HARD_DELETE_GROUP',
  'ADMIN_BULK_DELETE_GROUPS',
  'ADMIN_REMOVE_GROUP_MEMBER',
  'ADMIN_DELETE_USER',
  'ADMIN_SUSPEND_USER',
  'ADMIN_BAN_USER',
  'ADMIN_UPDATE_USER_ROLE',
  'ADMIN_DELETE_FEEDBACK',
  'ADMIN_UPDATE_REPORT_STATUS',
  'ADMIN_DISMISS_REPORT',
  'ADMIN_RESOLVE_REPORT',
  'ADMIN_SEND_NOTIFICATION',
  'ADMIN_CREATE_NOTIFICATION',
  'ADMIN_DELETE_NOTIFICATION',
  'ADMIN_LOGIN',
  'ADMIN_LOGOUT',
  'ADMIN_PASSWORD_CHANGE',
  'ADMIN_PERMISSIONS_UPDATE'
];

// Skip logging these frequent actions
const SKIP_ACTIONS = [
  'ADMIN_VIEW_AUDIT_LOGS',
  'ADMIN_VIEW_AUDIT_STATISTICS',
  'ADMIN_VIEW_AUDIT_LOG_DETAIL',
  'ADMIN_VIEWED_GROUPS',
  'ADMIN_VIEWED_GROUP_STATISTICS',
  'ADMIN_VIEWED_GROUP_DETAILS',
  'ADMIN_VIEWED_USERS',
  'ADMIN_VIEWED_USER_DETAILS',
  'ADMIN_VIEWED_FEEDBACK',
  'ADMIN_VIEWED_FEEDBACK_STATS',
  'ADMIN_VIEWED_REPORTS',
  'ADMIN_VIEWED_REPORT_STATS',
  'ADMIN_VIEWED_DASHBOARD',
  'ADMIN_VIEWED_NOTIFICATIONS'
];

export class AdminAuditService {
  
  // ========== CREATE AUDIT LOG - ONLY FOR IMPORTANT ACTIONS ==========
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
      // Skip logging for view actions (read-only)
      if (SKIP_ACTIONS.includes(action)) {
        return null; // Don't log these
      }

      // For important actions, log with full details
      const log = await prisma.adminAuditLog.create({
        data: {
          adminId,
          targetUserId: data.targetUserId,
          action,
          details: data.details || {},
          ipAddress: data.ipAddress,
          userAgent: data.userAgent
        }
      });

      console.log(`📝 Important audit log: ${action}`);
      return log;

    } catch (error) {
      console.error('Error creating audit log:', error);
      return null;
    }
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
    const where: any = {};
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [totalLogs, logsByAction, logsByAdmin, recentActivity] = await Promise.all([
      prisma.adminAuditLog.count({ where }),
      prisma.adminAuditLog.groupBy({ 
        by: ['action'], 
        _count: true, 
        where,
        orderBy: { _count: { action: 'desc' } }
      }),
      prisma.adminAuditLog.groupBy({ 
        by: ['adminId'], 
        _count: true, 
        where,
        orderBy: { _count: { adminId: 'desc' } },
        take: 5
      }),
      prisma.adminAuditLog.findMany({
        where,
        include: { admin: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

    // Fix: Handle the groupBy results correctly
    // logsByAction is an array of objects with action and _count (number)
    const formattedByAction = logsByAction.map((item: any) => ({
      action: item.action,
      count: Number(item._count)
    }));

    // Fix: Handle top admins
    const topAdmins = await Promise.all(
      logsByAdmin.map(async (item: any) => {
        try {
          const admin = await prisma.systemAdmin.findUnique({
            where: { id: item.adminId },
            select: { fullName: true }
          });
          return {
            adminId: item.adminId,
            adminName: admin?.fullName || 'Unknown Admin',
            count: Number(item._count)
          };
        } catch (error) {
          return {
            adminId: item.adminId,
            adminName: 'Unknown Admin',
            count: Number(item._count)
          };
        }
      })
    );

    return {
      success: true,
      statistics: {
        total: Number(totalLogs),
        byAction: formattedByAction,
        topAdmins,
        recentActivity: recentActivity.map(log => ({
          id: log.id,
          action: log.action,
          adminName: log.admin?.fullName || 'Unknown',
          createdAt: log.createdAt
        }))
      }
    };

  } catch (error: any) {
    console.error('Error fetching audit statistics:', error);
    return { success: false, message: error.message || 'Failed to fetch statistics' };
  }
}

  // ========== CLEAN OLD LOGS ==========
  static async cleanOldLogs(daysToKeep: number = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await prisma.adminAuditLog.deleteMany({
        where: { createdAt: { lt: cutoffDate } }
      });

      console.log(`🧹 Cleaned ${result.count} old audit logs`);
      return { success: true, deletedCount: result.count };

    } catch (error: any) {
      console.error('Error cleaning old logs:', error);
      return { success: false, message: error.message || 'Failed to clean old logs' };
    }
  }
}