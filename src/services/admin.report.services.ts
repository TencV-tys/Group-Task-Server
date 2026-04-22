// services/admin.report.services.ts - FULLY UPDATED WITH SocketService

import prisma from "../prisma";
import { AdminNotificationsService } from "./admin.notifications.service";
import { ReportStatus } from "@prisma/client";
import { SocketService } from "./socket.services";
import { UserNotificationService } from "./user.notification.services";

export class AdminReportService {
  
  // ========== GET ALL REPORTS ==========
// ========== GET ALL REPORTS ==========
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
    const where: any = { deletedAt: null  };

    if (status && status !== 'ALL') where.status = status;
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

    // ✅ FIXED: Return reports directly (not wrapped in data)
    return {
      success: true,
      message: "Reports retrieved successfully",
      reports,  // ← Direct access
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

  
  // services/admin.report.services.ts - UPDATE updateReportStatus method

static async updateReportStatus(
  reportId: string,
  adminId: string,
  status: ReportStatus,
  resolutionNotes?: string
) {
  try {
    // First, verify the admin exists in the database
    const admin = await prisma.systemAdmin.findUnique({
      where: { id: adminId },
      select: { id: true, fullName: true, email: true, isActive: true }
    });

    if (!admin || !admin.isActive) {
      console.error(`❌ Admin not found or inactive: ${adminId}`);
      return {
        success: false,
        message: "Admin not found or inactive"
      };
    }

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

    // Prepare update data - ONLY set resolvedBy when status is RESOLVED or DISMISSED
    const updateData: any = {
      status,
      resolutionNotes: resolutionNotes || undefined,
    };

    // Only set resolvedBy and resolvedAt when the status is RESOLVED or DISMISSED
    if (status === 'RESOLVED' || status === 'DISMISSED') {
      updateData.resolvedBy = adminId;
      updateData.resolvedAt = new Date();
    } else {
      // If status is PENDING or REVIEWING, clear the resolver
      updateData.resolvedBy = null;
      updateData.resolvedAt = null;
    }

    console.log(`📝 Updating report ${reportId}:`, { status, adminId, updateData });

    // Update the report
    const updatedReport = await prisma.report.update({
      where: { id: reportId },
      data: updateData,
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

    // ===== EMIT REAL-TIME SOCKET EVENT TO REPORTER =====
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

    // ===== EMIT REAL-TIME SOCKET EVENT TO OTHER ADMINS =====
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

    // ✅ ADD THIS: Emit group report count update to refresh group lists
    await SocketService.emitGroupReportCountUpdated(groupId, updatedReport.group?.name || '');

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

    console.log(`✅ Report ${reportId} status updated from ${oldStatus} to ${status}`);

    return {
      success: true,
      message: `Report status updated to ${status}`,
      report: updatedReport
    }; 

  } catch (error: any) {
    console.error("❌ [REPORT] Error updating report:", error);
    
    // Log more details about the error
    if (error.code === 'P2003') {
      console.error(`Foreign key violation: ${error.meta?.constraint}`);
      return {
        success: false,
        message: "Invalid admin ID or foreign key constraint failed"
      };
    }
    
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
    // Exclude soft-deleted reports from stats
    const whereCondition = {
      deletedAt: null  // Don't count soft-deleted reports
    };
    
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
        byType: byType.map(item => ({
          type: item.type,
          count: item._count
        }))
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

// ========== DELETE REPORT (SOFT DELETE) ==========
static async deleteReport(reportId: string, adminId: string, hardDelete: boolean = false) {
  try {
    // Get admin info
    const admin = await prisma.systemAdmin.findUnique({
      where: { id: adminId },
      select: { fullName: true, email: true }
    });

    // Get the report before deletion
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

    let deletedReport;
    
    if (hardDelete) {
      // HARD DELETE - permanently remove from database
      deletedReport = await prisma.report.delete({
        where: { id: reportId }
      });
      
      console.log(`🗑️ [REPORT] Report ${reportId} permanently deleted by ${admin?.fullName || 'Admin'}`);
      
      // Notify admins about hard delete
      const otherAdmins = await prisma.systemAdmin.findMany({
        where: {
          isActive: true,
          id: { not: adminId }
        },
        select: { id: true, fullName: true, email: true }
      });

      for (const otherAdmin of otherAdmins) {
        await AdminNotificationsService.createNotification({
          adminId: otherAdmin.id,
          type: "REPORT_DELETED",
          title: "🗑️ Report Permanently Deleted",
          message: `Report #${reportId.slice(0, 8)} was permanently deleted by ${admin?.fullName || 'Admin'}`,
          priority: "HIGH",
          data: {
            reportId: reportId,
            groupId: existingReport.group?.id,
            groupName: existingReport.group?.name,
            deletedBy: admin?.fullName,
            deletedAt: new Date(),
            hardDelete: true
          }
        });
      }
      
      // Emit socket event for hard delete
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
      
    } else {
      // SOFT DELETE - mark as deleted but keep in database
      deletedReport = await prisma.report.update({
        where: { id: reportId },
        data: {
          deletedAt: new Date(),
          deletedBy: adminId  // Store the admin ID as string, no relation needed
        }
      });
      
      console.log(`📁 [REPORT] Report ${reportId} soft deleted by ${admin?.fullName || 'Admin'}`);
      
      // Notify reporter about soft delete
      if (existingReport.reporter) {
        await UserNotificationService.createNotification({
          userId: existingReport.reporter.id,
          type: "REPORT_DELETED",
          title: "🗑️ Report Removed",
          message: `Your report against "${existingReport.group?.name || 'a group'}" has been removed by admin.`,
          data: {
            reportId: reportId,
            groupId: existingReport.group?.id,
            groupName: existingReport.group?.name,
            deletedBy: admin?.fullName,
            deletedAt: new Date(),
            softDelete: true
          }
        });
        
        // Emit socket to reporter
        await SocketService.emitReportDeletedToUser(
          existingReport.reporter.id,
          reportId,
          existingReport.group?.id || '',
          existingReport.group?.name || '',
          admin?.fullName || 'Admin'
        );
      }
      
      // Notify admins about soft delete
      const otherAdmins = await prisma.systemAdmin.findMany({
        where: {
          isActive: true,
          id: { not: adminId }
        },
        select: { id: true, fullName: true, email: true }
      });

      for (const otherAdmin of otherAdmins) {
        await AdminNotificationsService.createNotification({
          adminId: otherAdmin.id,
          type: "REPORT_DELETED",
          title: "📁 Report Soft Deleted",
          message: `Report #${reportId.slice(0, 8)} was soft deleted by ${admin?.fullName || 'Admin'}`,
          priority: "MEDIUM",
          data: {
            reportId: reportId,
            groupId: existingReport.group?.id,
            groupName: existingReport.group?.name,
            deletedBy: admin?.fullName,
            deletedAt: new Date(),
            hardDelete: false
          }
        });
      }
      
      // Emit socket event for soft delete
      await SocketService.emitReportDeleted(
        otherAdmins.map(a => a.id),
        reportId,
        existingReport.group?.id || '',
        existingReport.group?.name || '',
        existingReport.reporter?.id || '',
        existingReport.reporter?.fullName || '',
        admin?.fullName || 'Admin',
        false
      );
    }

    return {
      success: true,
      message: hardDelete ? "Report permanently deleted" : "Report soft deleted successfully",
      data: deletedReport
    };

  } catch (error: any) {
    console.error("❌ [REPORT] Error deleting report:", error);
    return {
      success: false,
      message: error.message || "Failed to delete report"
    };
  }
}

// ========== BULK DELETE REPORTS ==========
static async bulkDeleteReports(
  reportIds: string[],
  adminId: string,
  hardDelete: boolean = false
) {
  try {
    const results = {
      totalCount: reportIds.length,
      successCount: 0,
      failedIds: [] as string[],
      deletedReports: [] as any[]
    };

    for (const reportId of reportIds) {
      try {
        const result = await this.deleteReport(reportId, adminId, hardDelete);

        if (result.success && result.data) {
          results.successCount++;
          results.deletedReports.push(result.data);
        } else {
          results.failedIds.push(reportId);
        }
      } catch (error) {
        results.failedIds.push(reportId);
      }
    }

    console.log(`📢 [REPORT] Bulk delete completed: ${results.successCount}/${results.totalCount} reports deleted`);

    return {
      success: true,
      message: `Deleted ${results.successCount} out of ${results.totalCount} reports`,
      data: results
    };

  } catch (error: any) {
    console.error("❌ [REPORT] Error in bulk delete:", error);
    return {
      success: false,
      message: error.message || "Failed to bulk delete reports"
    };
  }
}
}