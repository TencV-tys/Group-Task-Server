// services/user.report.services.ts
import prisma from "../prisma";
import { AdminNotificationsService } from "./admin.notifications.service";
import { ReportType } from "@prisma/client"; // 👈 ADD THIS IMPORT

export class UserReportService {
  
  // ========== CREATE GROUP REPORT ==========
  static async createGroupReport(
    reporterId: string,
    groupId: string,
    type: ReportType, // 👈 Change from string to ReportType
    description: string
  ) {
    try {
      // Create the report
      const report = await prisma.report.create({
        data: {
          reporterId,
          groupId,
          type, // Now this is the correct enum type
          description,
          status: 'PENDING'
        },
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
              description: true
            }
          }
        }
      });

      if (!report) {
        throw new Error("Failed to create report");
      }

      // Get all system admins
      const admins = await prisma.systemAdmin.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      // Safely access nested properties
      const reporterName = (report as any).reporter?.fullName || 'A user';
      const groupName = (report as any).group?.name || 'a group';
      const reporterId_ = (report as any).reporter?.id || reporterId;
      const groupId_ = (report as any).group?.id || groupId;

      // Create notifications for all admins
      for (const admin of admins) {
        await AdminNotificationsService.createNotification({
          adminId: admin.id,
          type: "REPORT_SUBMITTED",
          title: "🚨 New Group Report",
          message: `${reporterName} reported "${groupName}" for ${type}`,
          priority: "HIGH",
          data: {
            reportId: report.id,
            groupId: groupId_,
            groupName: groupName,
            reporterId: reporterId_,
            reporterName: reporterName,
            reportType: type,
            description,
            createdAt: report.createdAt
          }
        });
      }

      return {
        success: true,
        message: "Report submitted successfully",
        report
      };

    } catch (error: any) {
      console.error("Error creating report:", error);
      return {
        success: false,
        message: error.message || "Failed to submit report"
      };
    }
  }
}