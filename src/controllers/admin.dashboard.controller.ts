// controllers/admin.dashboard.controller.ts
import { Response } from "express";
import { AdminAuthRequest } from "../middlewares/admin.auth.middleware";
import prisma from "../prisma";

export class AdminDashboardController {
  
  static async getStats(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      // Get current date boundaries
      const now = new Date();
      const today = new Date(now.setHours(0, 0, 0, 0));
      const weekAgo = new Date(now.setDate(now.getDate() - 7));
      const monthAgo = new Date(now.setMonth(now.getMonth() - 1));

      // Fetch all stats in parallel
      const [
        totalUsers,
        newUsersToday,
        activeUsers,
        suspendedUsers,
        totalGroups,
        groupsWithReports,
        totalFeedback,
        openFeedback,
        inProgressFeedback,
        resolvedFeedback,
        totalReports,
        pendingReports,
        reviewingReports,
        resolvedReports,
        dismissedReports,
        unreadNotifications,
        totalNotifications,
        systemAdmins,
        groupAdmins,
        auditLast24h,
        auditLast7d,
        auditLast30d,
        recentActivity
      ] = await Promise.all([
        // Users
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
        prisma.user.count({ where: { roleStatus: 'ACTIVE' } }),
        prisma.user.count({ where: { roleStatus: 'SUSPENDED' } }),
        
        // Groups
        prisma.group.count(),
        prisma.report.groupBy({
          by: ['groupId'],
          _count: true,
          having: { groupId: { _count: { gt: 0 } } }
        }).then(result => result.length),
        
        // Feedback
        prisma.feedback.count(),
        prisma.feedback.count({ where: { status: 'OPEN' } }),
        prisma.feedback.count({ where: { status: 'IN_PROGRESS' } }),
        prisma.feedback.count({ where: { status: 'RESOLVED' } }),
        
        // Reports
        prisma.report.count(),
        prisma.report.count({ where: { status: 'PENDING' } }),
        prisma.report.count({ where: { status: 'REVIEWING' } }),
        prisma.report.count({ where: { status: 'RESOLVED' } }),
        prisma.report.count({ where: { status: 'DISMISSED' } }),
        
        // Notifications
        prisma.adminNotification.count({ where: { read: false } }),
        prisma.adminNotification.count(),
        
        // Admins
        prisma.systemAdmin.count(),
        prisma.groupMember.count({ where: { groupRole: 'ADMIN' } }),
        
        // Audit logs
        prisma.adminAuditLog.count({ where: { createdAt: { gte: today } } }),
        prisma.adminAuditLog.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.adminAuditLog.count({ where: { createdAt: { gte: monthAgo } } }),
        
        // Recent activity
        prisma.adminAuditLog.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            admin: { select: { fullName: true } },
            targetUser: { select: { fullName: true } }
          }
        })
      ]);

      return res.json({
        success: true,
        data: {
          users: {
            total: totalUsers,
            newToday: newUsersToday,
            active: activeUsers,
            suspended: suspendedUsers
          },
          groups: {
            total: totalGroups,
            groupsWithReports,
            totalMembers: await prisma.groupMember.count()
          },
          feedback: {
            total: totalFeedback,
            open: openFeedback,
            inProgress: inProgressFeedback,
            resolved: resolvedFeedback
          },
          reports: {
            total: totalReports,
            pending: pendingReports,
            reviewing: reviewingReports,
            resolved: resolvedReports,
            dismissed: dismissedReports
          },
          notifications: {
            unread: unreadNotifications,
            total: totalNotifications
          },
          admins: {
            systemAdmins,
            groupAdmins
          },
          auditLogs: {
            last24h: auditLast24h,
            last7d: auditLast7d,
            last30d: auditLast30d
          },
          recentActivity
        }
      });

    } catch (error: any) {
      console.error("Error in getStats:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}