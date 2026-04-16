// controllers/admin.dashboard.controller.ts - COMPLETE FIXED

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

      // Date boundaries
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      monthAgo.setHours(0, 0, 0, 0);

      // Fetch all stats in parallel
      const [
        totalUsers,
        newUsersToday,
        activeUsers,
        suspendedUsers,
        totalGroups,
        activeGroups,
        suspendedGroups,
        deletedGroups,
        totalGroupMembers,
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
        auditLast24h,
        auditLast7d,
        auditLast30d,
        recentActivity
      ] = await Promise.all([
        // USERS
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
        prisma.user.count({ where: { roleStatus: 'ACTIVE' } }),
        prisma.user.count({ where: { roleStatus: 'SUSPENDED' } }),
        
        // GROUPS
        prisma.group.count(),
        prisma.group.count({ where: { status: 'ACTIVE', isDeleted: false } }),
        prisma.group.count({ where: { status: 'SUSPENDED', isDeleted: false } }),
        prisma.group.count({ where: { isDeleted: true } }),
        prisma.groupMember.count({ where: { group: { isDeleted: false }, isActive: true } }),
        
        // FEEDBACK
        prisma.feedback.count(),
        prisma.feedback.count({ where: { status: 'OPEN' } }),
        prisma.feedback.count({ where: { status: 'IN_PROGRESS' } }),
        prisma.feedback.count({ where: { status: 'RESOLVED' } }),
        
        // REPORTS
        prisma.report.count(),
        prisma.report.count({ where: { status: 'PENDING' } }),
        prisma.report.count({ where: { status: 'REVIEWING' } }),
        prisma.report.count({ where: { status: 'RESOLVED' } }),
        prisma.report.count({ where: { status: 'DISMISSED' } }),
        
        // NOTIFICATIONS
        prisma.adminNotification.count({ where: { read: false } }),
        prisma.adminNotification.count(),
        
        // ADMINS
        prisma.systemAdmin.count(),
        
        // AUDIT LOGS
        prisma.adminAuditLog.count({ where: { createdAt: { gte: today } } }),
        prisma.adminAuditLog.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.adminAuditLog.count({ where: { createdAt: { gte: monthAgo } } }),
        
        // RECENT ACTIVITY
        prisma.adminAuditLog.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            admin: { select: { id: true, fullName: true, email: true } },
            targetUser: { select: { id: true, fullName: true, email: true, avatarUrl: true } }
          }
        })
      ]);

      // Get group admins (distinct users who are admins of any active group)
      const groupAdmins = await prisma.groupMember.groupBy({
        by: ['userId'],
        where: {
          groupRole: 'ADMIN',
          group: { isDeleted: false }
        }
      }).then(result => result.length);

      // Get groups with reports (only active groups)
      const groupsWithReports = await prisma.report.groupBy({
        by: ['groupId'],
        where: {
          group: { isDeleted: false }
        },
        _count: true
      }).then(result => result.length);

      console.log('📊 Dashboard Stats:', {
        users: { total: totalUsers, active: activeUsers },
        groups: { total: totalGroups, active: activeGroups, suspended: suspendedGroups, deleted: deletedGroups },
        members: totalGroupMembers,
        groupAdmins
      });

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
            active: activeGroups,
            suspended: suspendedGroups,
            deleted: deletedGroups,
            groupsWithReports,
            totalMembers: totalGroupMembers
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
        message: error.message || "Internal server error"
      });
    }
  }
}