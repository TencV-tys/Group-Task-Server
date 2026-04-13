// services/admin.report.services.ts - FULLY UPDATED WITH SocketService

import prisma from "../prisma";
import { AdminNotificationsService } from "./admin.notifications.service";
import { ReportStatus } from "@prisma/client";
import { SocketService } from "./socket.services";
import { UserNotificationService } from "./user.notification.services";

export class AdminReportService {
  
  // ========== GET ALL REPORTS ==========
  static async getReports(filters: {
    status?: string;
    type?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}) {
    try {
      const {
        status,
        type,
        search,
        page = 1,
        limit = 20
      } = filters;

      const skip = (page - 1) * limit;
      const where: any = {};

      if (status) where.status = status;
      if (type) where.type = type;
      if (search) {
        where.OR = [
          { description: { contains: search, mode: 'insensitive' } },
          { reporter: { fullName: { contains: search, mode: 'insensitive' } } },
          { group: { name: { contains: search, mode: 'insensitive' } } }
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
        data: {
          reports,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
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
        where: { id: reportId },
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

  // ========== UPDATE REPORT STATUS - WITH REAL-TIME ==========
  static async updateReportStatus(
    reportId: string,
    adminId: string,
    status: ReportStatus,
    resolutionNotes?: string
  ) {
    try {
      // Get admin info
      const admin = await prisma.systemAdmin.findUnique({
        where: { id: adminId },
        select: { fullName: true, email: true }
      });

      // Get the report before update for comparison
      const existingReport = await prisma.report.findUnique({
        where: { id: reportId },
        include: {
          reporter: { select: { id: true, fullName: true, email: true } },
          group: { select: { id: true, name: true } }
        }
      });

      if (!existingReport) {
        return {
          success: false,
          message: "Report not found"
        };
      }

      // Update the report
      const updatedReport = await prisma.report.update({
        where: { id: reportId },
        data: {
          status,
          resolvedBy: adminId,
          resolutionNotes: resolutionNotes || undefined,
          resolvedAt: status === 'RESOLVED' || status === 'DISMISSED' ? new Date() : null
        },
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

      const groupName = updatedReport.group?.name || 'a group';
      const groupId = updatedReport.group?.id || '';
      const reporterName = updatedReport.reporter?.fullName || 'A user';
      const oldStatus = existingReport.status;

      // ===== EMIT REAL-TIME SOCKET EVENT TO REPORTER using SocketService =====
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

      // ===== NOTIFY THE REPORTER VIA PUSH NOTIFICATION =====
      if (status === 'RESOLVED' || status === 'DISMISSED') {
        const action = status === 'RESOLVED' ? 'resolved' : 'dismissed';
        
        await UserNotificationService.createNotification({
          userId: updatedReport.reporterId,
          type: "REPORT_RESOLVED",
          title: status === 'RESOLVED' ? "✅ Report Resolved" : "ℹ️ Report Dismissed",
          message: `Your report against "${groupName}" has been ${action}. ${resolutionNotes ? `\n\nNote: ${resolutionNotes}` : ''}`,
          data: {
            reportId: updatedReport.id,
            groupId: groupId,
            groupName: groupName,
            status,
            resolutionNotes,
            resolvedAt: new Date(),
            resolvedBy: admin?.fullName
          }
        });
      }

      // ===== EMIT REAL-TIME SOCKET EVENT TO OTHER ADMINS using SocketService =====
      const otherAdmins = await prisma.systemAdmin.findMany({
        where: {
          isActive: true,
          id: { not: adminId }
        },
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

      // Create notifications for other admins
      for (const otherAdmin of otherAdmins) {
        await AdminNotificationsService.createNotification({
          adminId: otherAdmin.id,
          type: "REPORT_UPDATED",
          title: "📋 Report Status Updated",
          message: `Report #${reportId.slice(0, 8)} was marked as ${status} by ${admin?.fullName || 'Admin'}`,
          priority: "MEDIUM",
          data: {
            reportId: updatedReport.id,
            groupId: groupId,
            groupName: groupName,
            oldStatus,
            newStatus: status,
            resolutionNotes,
            resolvedBy: admin?.fullName,
            resolvedAt: new Date()
          }
        });
      }

      console.log(`📢 [REPORT] Report ${reportId} status updated from ${oldStatus} to ${status} - Notified reporter + ${otherAdmins.length} admins`);

      return {
        success: true,
        message: `Report status updated to ${status}`,
        report: updatedReport
      };

    } catch (error: any) {
      console.error("❌ [REPORT] Error updating report:", error);
      return {
        success: false,
        message: error.message || "Failed to update report"
      };
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
      const results = {
        totalCount: reportIds.length,
        successCount: 0,
        failedIds: [] as string[],
        updatedReports: [] as any[]
      };

      for (const reportId of reportIds) {
        try {
          const result = await this.updateReportStatus(
            reportId,
            adminId,
            status,
            resolutionNotes
          );

          if (result.success && result.report) {
            results.successCount++;
            results.updatedReports.push(result.report);
          } else {
            results.failedIds.push(reportId);
          }
        } catch (error) {
          results.failedIds.push(reportId);
        }
      }

      console.log(`📢 [REPORT] Bulk update completed: ${results.successCount}/${results.totalCount} reports updated to ${status}`);

      return {
        success: true,
        message: `Updated ${results.successCount} out of ${results.totalCount} reports to ${status}`,
        data: results
      };

    } catch (error: any) {
      console.error("❌ [REPORT] Error in bulk update:", error);
      return {
        success: false,
        message: error.message || "Failed to bulk update reports"
      };
    }
  }

  // ========== GET REPORT STATISTICS ==========
  static async getReportStats() {
    try {
      const [pending, reviewing, resolved, dismissed, total] = await Promise.all([
        prisma.report.count({ where: { status: "PENDING" } }),
        prisma.report.count({ where: { status: "REVIEWING" } }),
        prisma.report.count({ where: { status: "RESOLVED" } }),
        prisma.report.count({ where: { status: "DISMISSED" } }),
        prisma.report.count()
      ]);

      const byType = await prisma.report.groupBy({
        by: ['type'],
        _count: true
      });

      const typeStats: Record<string, number> = {};
      byType.forEach(item => {
        typeStats[item.type] = item._count;
      });

      return {
        success: true,
        message: "Report statistics retrieved",
        data: {
          total,
          pending,
          reviewing,
          resolved,
          dismissed,
          byType: typeStats
        }
      };

    } catch (error: any) {
      console.error("❌ [REPORT] Error getting stats:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve statistics"
      };
    }
  }
}