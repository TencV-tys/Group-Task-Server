// services/admin.report.services.ts
import prisma from "../prisma";
import { AdminNotificationsService } from "./admin.notifications.service";
import { ReportStatus } from "@prisma/client"; // 👈 ADD THIS IMPORT

export class AdminReportService {
  
  // ========== UPDATE REPORT STATUS ==========
  static async updateReportStatus(
    reportId: string,
    adminId: string,
    status: ReportStatus, // 👈 Change from string to ReportStatus
    resolutionNotes?: string
  ) {
    try {
      // Get admin info
      const admin = await prisma.systemAdmin.findUnique({
        where: { id: adminId },
        select: { fullName: true }
      });

      // Update the report
      const updatedReport = await prisma.report.update({
        where: { id: reportId },
        data: {
          status,
          resolvedBy: adminId,
          resolutionNotes,
          resolvedAt: status === 'RESOLVED' || status === 'DISMISSED' ? new Date() : null
        },
        include: {
          reporter: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          },
          group: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      // 👇 Add null check for updatedReport
      if (!updatedReport) {
        throw new Error("Failed to update report");
      }

      // Safely access nested properties
      const groupName = (updatedReport as any).group?.name || 'a group';
      const groupId = (updatedReport as any).group?.id || '';

      // Notify the reporter about the resolution
      if (status === 'RESOLVED' || status === 'DISMISSED') {
        const action = status === 'RESOLVED' ? 'resolved' : 'dismissed';
        
        await prisma.userNotification.create({
          data: {
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
              resolvedAt: new Date()
            }
          }
        });
      }

      // Notify other admins about the update
      const otherAdmins = await prisma.systemAdmin.findMany({
        where: {
          isActive: true,
          id: { not: adminId }
        },
        select: { id: true }
      });

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
            status,
            resolutionNotes,
            resolvedBy: admin?.fullName,
            resolvedAt: new Date()
          }
        });
      }

      return {
        success: true,
        message: "Report status updated successfully",
        report: updatedReport
      };

    } catch (error: any) {
      console.error("Error updating report:", error);
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
    status: ReportStatus, // 👈 Change from string to ReportStatus
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

      return results;

    } catch (error: any) {
      console.error("Error in bulk update:", error);
      throw error;
    }
  }
}