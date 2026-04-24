// services/admin.report.services.ts - FIXED FOR MySQL (remove mode: 'insensitive')

import prisma from "../prisma";
import { AdminNotificationsService } from "./admin.notifications.service";
import { ReportStatus } from "@prisma/client";
import { SocketService } from "./socket.services";
import { UserNotificationService } from "./user.notification.services";

export class AdminReportService {
  
  // ========== GET ALL REPORTS - FIXED FOR MySQL ==========
  static async getReports(filters: {
    status?: string;
    type?: string; 
    search?: string; 
    page?: number;
    limit?: number;
  } = {}) {
    try {
      const { status, type, search, page = 1, limit = 20 } = filters;
      const skip = (page - 1) * limit;
      const where: any = { deletedAt: null };

      if (status && status !== 'ALL') where.status = status;
      if (type) where.type = type;
      
      // ✅ FIX: Remove 'mode: insensitive' for MySQL compatibility
      if (search && search.trim()) { 
        where.OR = [
          { description: { contains: search.trim() } },
          { reporter: { fullName: { contains: search.trim() } } },
          { group: { name: { contains: search.trim() } } }
        ];
      }

      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            reporter: {
              select: { 
                id: true,
                fullName: true,
                email: true,
                avatarUrl: true
              }
            },
            group: {
              select: {
                id: true,
                name: true,
                description: true,
                avatarUrl: true,
                _count: {
                  select: { members: true, tasks: true }
                }
              }
            },
            resolver: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            }
          }
        }),
        prisma.report.count({ where })
      ]);

      return {
        success: true,
        message: "Reports retrieved successfully",
        reports,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error: any) {
      console.error("❌ [REPORT] Error getting reports:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve reports"
      };
    }
  }

  // ========== GET SINGLE REPORT ==========
  static async getReportById(reportId: string) {
    try {
      const report = await prisma.report.findUnique({
        where: { id: reportId, deletedAt: null },
        include: {
          reporter: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true,
              createdAt: true
            }
          },
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              avatarUrl: true,
              createdAt: true,
              _count: {
                select: {
                  members: true,
                  tasks: true
                }
              }
            }
          },
          resolver: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          }
        }
      });

      if (!report) {
        return {
          success: false,
          message: "Report not found"
        };
      }

      return {
        success: true,
        message: "Report retrieved successfully",
        data: report
      };

    } catch (error: any) {
      console.error("❌ [REPORT] Error getting report:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve report"
      };
    }
  }

  // ========== UPDATE REPORT STATUS ==========
  static async updateReportStatus(
    reportId: string,
    adminId: string,
    status: ReportStatus,
    resolutionNotes?: string
  ) {
    try {
      const admin = await prisma.systemAdmin.findUnique({
        where: { id: adminId },
        select: { id: true, fullName: true, email: true, isActive: true }
      });

      if (!admin || !admin.isActive) {
        return { success: false, message: "Admin not found or inactive" };
      }

      const existingReport = await prisma.report.findUnique({
        where: { id: reportId, deletedAt: null },
        include: {
          reporter: { select: { id: true, fullName: true, email: true } },
          group: { select: { id: true, name: true } }
        }
      });

      if (!existingReport) {
        return { success: false, message: "Report not found" };
      }

      const updateData: any = { status, resolutionNotes: resolutionNotes || undefined };

      if (status === 'RESOLVED' || status === 'DISMISSED') {
        updateData.resolvedBy = adminId;
        updateData.resolvedAt = new Date();
      } else {
        updateData.resolvedBy = null;
        updateData.resolvedAt = null;
      }

      const updatedReport = await prisma.report.update({
        where: { id: reportId },
        data: updateData,
        include: {
          reporter: {
            select: { id: true, fullName: true, email: true, avatarUrl: true, createdAt: true }
          },
          group: {
            select: { id: true, name: true, description: true, avatarUrl: true, createdAt: true,
              _count: { select: { members: true, tasks: true } }
            }
          },
          resolver: { select: { id: true, fullName: true, email: true } }
        }
      });

      const groupName = updatedReport.group?.name || 'a group';
      const groupId = updatedReport.group?.id || '';
      const reporterName = updatedReport.reporter?.fullName || 'A user';
      const oldStatus = existingReport.status;

      // Emit to reporter
      await SocketService.emitReportStatusChanged(
        updatedReport.reporterId,
        updatedReport.id,
        groupId,
        groupName,
        oldStatus,
        status,
        admin?.fullName || 'Admin',
        resolutionNotes
      );

      // Notify reporter via push
      if (status === 'RESOLVED' || status === 'DISMISSED') {
        const action = status === 'RESOLVED' ? 'resolved' : 'dismissed';
        await UserNotificationService.createNotification({
          userId: updatedReport.reporterId,
          type: "REPORT_RESOLVED",
          title: status === 'RESOLVED' ? "✅ Report Resolved" : "ℹ️ Report Dismissed",
          message: `Your report against "${groupName}" has been ${action}. ${resolutionNotes ? `\n\nNote: ${resolutionNotes}` : ''}`,
          data: { reportId, groupId, groupName, status, resolutionNotes, resolvedAt: new Date(), resolvedBy: admin?.fullName }
        });
      }

      // Emit to other admins
      const otherAdmins = await prisma.systemAdmin.findMany({
        where: { isActive: true, id: { not: adminId } },
        select: { id: true, fullName: true, email: true }
      });

      if (otherAdmins.length > 0) {
        await SocketService.emitReportStatusChangedToAdmins(
          otherAdmins.map(a => a.id),
          updatedReport.id,
          groupId,
          groupName,
          updatedReport.reporterId,
          reporterName,
          oldStatus,
          status,
          admin?.fullName || 'Admin',
          resolutionNotes
        );
      }

      // Emit group report count update
      await SocketService.emitGroupReportCountUpdated(groupId, groupName);

      // Create notifications for other admins
      for (const otherAdmin of otherAdmins) {
        await AdminNotificationsService.createNotification({
          adminId: otherAdmin.id,
          type: "REPORT_UPDATED",
          title: "📋 Report Status Updated",
          message: `Report #${reportId.slice(0, 8)} was marked as ${status} by ${admin?.fullName || 'Admin'}`,
          priority: "MEDIUM",
          data: { reportId, groupId, groupName, oldStatus, newStatus: status, resolutionNotes, resolvedBy: admin?.fullName, resolvedAt: new Date() }
        });
      }

      return {
        success: true,
        message: `Report status updated to ${status}`,
        report: updatedReport
      };

    } catch (error: any) {
      console.error("❌ [REPORT] Error updating report:", error);
      return { success: false, message: error.message || "Failed to update report" };
    }
  }

  // ========== BULK UPDATE REPORTS ==========
  static async bulkUpdateReports(
    reportIds: string[],
    adminId: string,
    status: ReportStatus,
    resolutionNotes?: string
  ) {
    try {
      let successCount = 0;
      const failedIds: string[] = [];

      for (const reportId of reportIds) {
        try {
          const result = await this.updateReportStatus(reportId, adminId, status, resolutionNotes);
          if (result.success) successCount++;
          else failedIds.push(reportId);
        } catch (error) {
          failedIds.push(reportId);
        }
      }

      return {
        success: true,
        message: `Updated ${successCount} out of ${reportIds.length} reports to ${status}`,
        data: { totalCount: reportIds.length, successCount, failedIds }
      };

    } catch (error: any) {
      console.error("❌ [REPORT] Error in bulk update:", error);
      return { success: false, message: error.message || "Failed to bulk update reports" };
    }
  }

  // ========== GET REPORT STATISTICS ==========
  static async getReportStats() {
    try {
      const whereCondition = { deletedAt: null };
      
      const [pending, reviewing, resolved, dismissed, total] = await Promise.all([
        prisma.report.count({ where: { ...whereCondition, status: "PENDING" } }),
        prisma.report.count({ where: { ...whereCondition, status: "REVIEWING" } }),
        prisma.report.count({ where: { ...whereCondition, status: "RESOLVED" } }),
        prisma.report.count({ where: { ...whereCondition, status: "DISMISSED" } }),
        prisma.report.count({ where: whereCondition })
      ]);

      const byType = await prisma.report.groupBy({
        by: ['type'],
        where: whereCondition,
        _count: true
      });

      return {
        success: true,
        message: "Report statistics retrieved",
        statistics: {
          overview: {
            total,
            pending,
            reviewing,
            resolved,
            dismissed,
            resolutionRate: total > 0 ? Math.round(((resolved + dismissed) / total) * 100) : 0
          },
          byType: byType.map(item => ({ type: item.type, count: item._count }))
        }
      };

    } catch (error: any) {
      console.error("❌ [REPORT] Error getting stats:", error);
      return { success: false, message: error.message || "Failed to retrieve statistics" };
    }
  }

  // ========== DELETE REPORT ==========
  static async deleteReport(reportId: string, adminId: string, hardDelete: boolean = false) {
    try {
      const admin = await prisma.systemAdmin.findUnique({
        where: { id: adminId },
        select: { fullName: true, email: true }
      });

      const existingReport = await prisma.report.findUnique({
        where: { id: reportId },
        include: {
          reporter: { select: { id: true, fullName: true, email: true } },
          group: { select: { id: true, name: true } }
        }
      });

      if (!existingReport) {
        return { success: false, message: "Report not found" };
      }

      if (hardDelete) {
        await prisma.report.delete({ where: { id: reportId } });
        
        const otherAdmins = await prisma.systemAdmin.findMany({
          where: { isActive: true, id: { not: adminId } },
          select: { id: true }
        });

        await SocketService.emitReportDeleted(
          otherAdmins.map(a => a.id),
          reportId,
          existingReport.group?.id || '',
          existingReport.group?.name || '',
          existingReport.reporter?.id || '',
          existingReport.reporter?.fullName || '',
          admin?.fullName || 'Admin',
          true
        );
        
        return { success: true, message: "Report permanently deleted" };
        
      } else {
        await prisma.report.update({
          where: { id: reportId },
          data: { deletedAt: new Date(), deletedBy: adminId }
        });
        
        if (existingReport.reporter) {
          await UserNotificationService.createNotification({
            userId: existingReport.reporter.id,
            type: "REPORT_DELETED",
            title: "🗑️ Report Removed",
            message: `Your report against "${existingReport.group?.name || 'a group'}" has been removed by admin.`,
            data: { reportId, groupId: existingReport.group?.id, groupName: existingReport.group?.name, deletedBy: admin?.fullName, deletedAt: new Date() }
          });
        }
        
        return { success: true, message: "Report soft deleted successfully" };
      }

    } catch (error: any) {
      console.error("❌ [REPORT] Error deleting report:", error);
      return { success: false, message: error.message || "Failed to delete report" };
    }
  }

  // ========== BULK DELETE REPORTS ==========
  static async bulkDeleteReports(reportIds: string[], adminId: string, hardDelete: boolean = false) {
    try {
      let successCount = 0;
      const failedIds: string[] = [];

      for (const reportId of reportIds) {
        try {
          const result = await this.deleteReport(reportId, adminId, hardDelete);
          if (result.success) successCount++;
          else failedIds.push(reportId);
        } catch (error) {
          failedIds.push(reportId);
        }
      }

      return {
        success: true,
        message: `Deleted ${successCount} out of ${reportIds.length} reports`,
        data: { totalCount: reportIds.length, successCount, failedIds }
      };

    } catch (error: any) {
      console.error("❌ [REPORT] Error in bulk delete:", error);
      return { success: false, message: error.message || "Failed to bulk delete reports" };
    }
  }
}