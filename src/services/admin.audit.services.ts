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

export class AdminAuditService {
  
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

      console.log(`📝 Audit log created: ${action} by admin ${adminId}`);
      return log;

    } catch (error) {
      console.error('Error creating audit log:', error);
      // Don't throw - audit logging should never break the main flow
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
    
    // FIX: Convert string dates to Date objects
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      
      if (filters.startDate) {
        // Create date range for the entire day
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        where.createdAt.gte = start;
      }
      
      if (filters.endDate) {
        // Create date range for the entire day
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    console.log('Prisma where clause:', JSON.stringify(where, null, 2)); // Debug

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        include: {
          admin: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          },
          targetUser: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true
            }
          }
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
    return {
      success: false,
      message: error.message || 'Failed to fetch audit logs'
    };
  }
 }
  // ========== GET AUDIT LOG BY ID ==========
  static async getLogById(logId: string) {
    try {
      const log = await prisma.adminAuditLog.findUnique({
        where: { id: logId },
        include: {
          admin: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          },
          targetUser: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true
            }
          }
        }
      });

      if (!log) {
        return {
          success: false,
          message: 'Audit log not found'
        };
      }

      return {
        success: true,
        log
      };

    } catch (error: any) {
      console.error('Error fetching audit log:', error);
      return {
        success: false,
        message: error.message || 'Failed to fetch audit log'
      };
    }
  }

// services/admin.audit.services.ts

// ========== GET AUDIT LOG STATISTICS ==========
static async getStatistics(filters?: { startDate?: Date; endDate?: Date }) {
  try {
    const where: any = {};
    
    // FIX: Handle date filters properly
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        where.createdAt.gte = start;
      }
      
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    console.log('Statistics where clause:', JSON.stringify(where, null, 2)); // Debug

    const [
      totalLogs,
      logsByAction,
      logsByAdmin,
      recentActivity
    ] = await Promise.all([
      // Total logs count
      prisma.adminAuditLog.count({ where }),
      
      // Group by action type
      prisma.adminAuditLog.groupBy({
        by: ['action'],
        _count: true,
        where,
        orderBy: {
          _count: {
            action: 'desc'
          }
        }
      }),
      
      // Top admins by activity
      prisma.adminAuditLog.groupBy({
        by: ['adminId'],
        _count: true,
        where,
        orderBy: {
          _count: {
            adminId: 'desc'
          }
        },
        take: 5
      }),
      
      // Recent activity
      prisma.adminAuditLog.findMany({
        where,
        include: {
          admin: {
            select: { 
              id: true,
              fullName: true,
              email: true 
            }
          },
          targetUser: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

    // Get admin names for top admins
    const topAdmins = await Promise.all(
      logsByAdmin.map(async (item) => {
        try {
          const admin = await prisma.systemAdmin.findUnique({
            where: { id: item.adminId },
            select: { fullName: true, email: true }
          });
          return {
            adminId: item.adminId,
            adminName: admin?.fullName || 'Unknown Admin',
            adminEmail: admin?.email || 'No email',
            count: item._count
          };
        } catch (error) {
          console.error(`Error fetching admin ${item.adminId}:`, error);
          return {
            adminId: item.adminId,
            adminName: 'Unknown Admin',
            adminEmail: 'No email',
            count: item._count
          };
        }
      })
    );

    // Format recent activity
    const formattedRecentActivity = recentActivity.map(log => ({
      id: log.id,
      action: log.action,
      adminId: log.adminId,
      adminName: log.admin?.fullName || 'Unknown Admin',
      adminEmail: log.admin?.email || 'No email',
      targetUserId: log.targetUserId,
      targetUserName: log.targetUser?.fullName,
      targetUserEmail: log.targetUser?.email,
      createdAt: log.createdAt,
      ipAddress: log.ipAddress,
      details: log.details
    }));

    // Get daily activity for the last 30 days (optional)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const dailyActivity = await prisma.$queryRaw`
      SELECT 
        DATE(createdAt) as date,
        COUNT(*) as count
      FROM admin_audit_logs
      WHERE createdAt >= ${thirtyDaysAgo}
      ${filters?.endDate ? `AND createdAt <= ${new Date(filters.endDate)}` : ''}
      GROUP BY DATE(createdAt)
      ORDER BY date DESC
      LIMIT 30
    `;

    return {
      success: true,
      statistics: {
        total: totalLogs,
        byAction: logsByAction.map(item => ({
          action: item.action,
          count: item._count
        })),
        topAdmins,
        recentActivity: formattedRecentActivity,
        dailyActivity: dailyActivity || []
      }
    };

  } catch (error: any) {
    console.error('Error fetching audit statistics:', error);
    return {
      success: false,
      message: error.message || 'Failed to fetch statistics'
    };
  }
}
  

  // ========== CLEAN OLD LOGS (for cron job) ==========
  static async cleanOldLogs(daysToKeep: number = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await prisma.adminAuditLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate
          }
        }
      });

      console.log(`🧹 Cleaned ${result.count} audit logs older than ${daysToKeep} days`);
      
      return {
        success: true,
        deletedCount: result.count
      };

    } catch (error: any) {
      console.error('Error cleaning old logs:', error);
      return {
        success: false,
        message: error.message || 'Failed to clean old logs'
      };
    }
  }
}