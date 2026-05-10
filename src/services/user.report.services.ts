import prisma from "../prisma";
import { AdminNotificationsService } from "./admin.notifications.service";
import { ReportType } from "@prisma/client";
import { SocketService } from "./socket.services";

export class UserReportService {
  
  // ========== CREATE GROUP REPORT (with photo) ==========
  static async createGroupReport(
    reporterId: string,
    groupId: string,
    type: ReportType,
    description: string,
    photoUrl: string | null = null // 👈 Add photoUrl parameter
  ) {
    try {
      // Validate input
      if (!description?.trim()) {
        return {
          success: false,
          message: "Report description is required"
        };
      }

      // Check if group exists
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, name: true, description: true }
      });

      if (!group) {
        return {
          success: false,
          message: "Group not found"
        };
      }

      // Get reporter info
      const reporter = await prisma.user.findUnique({
        where: { id: reporterId },
        select: { id: true, fullName: true, email: true, avatarUrl: true }
      });

      if (!reporter) {
        return {
          success: false,
          message: "Reporter not found"
        };
      }

      // Create the report with photo URL
      const report = await prisma.report.create({
        data: {
          reporterId,
          groupId,
          type,
          description: description.trim(),
          photoUrl, // 👈 Add photo URL
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
              description: true,
              avatarUrl: true
            }
          }
        }
      }); 

      if (!report) {
        throw new Error("Failed to create report");
      }

      const reporterName = reporter.fullName;
      const groupName = group.name;

      // Get all system admins
      const admins = await prisma.systemAdmin.findMany({
        where: { isActive: true },
        select: { id: true, fullName: true, email: true }
      });

      const adminIds = admins.map(a => a.id);

      // Emit real-time socket event to all admins
      if (adminIds.length > 0) {
        await SocketService.emitNewReportReceived(
          adminIds,
          report.id,
          group.id,
          groupName,
          reporter.id,
          reporterName,
          type,
          description,
          report.createdAt,
          photoUrl // 👈 Pass photo URL to socket event
        );
        console.log(`📢 [REPORT] New report ${report.id} - Notified ${adminIds.length} admins via socket`);
      }

      // Create notifications for all admins
      for (const admin of admins) {
        await AdminNotificationsService.createNotification({
          adminId: admin.id,
          type: "REPORT_SUBMITTED",
          title: "🚨 New Group Report",
          message: `${reporterName} reported "${groupName}" for ${type.replace('_', ' ')}${photoUrl ? ' 📸' : ''}`,
          priority: "HIGH",
          data: {
            reportId: report.id,
            groupId: group.id,
            groupName: groupName,
            reporterId: reporter.id,
            reporterName: reporterName,
            reporterEmail: reporter.email,
            reportType: type,
            description: description,
            photoUrl: photoUrl, // 👈 Include photo URL in notification
            createdAt: report.createdAt
          }
        });
      }

      // Create notification for the reporter (confirmation)
      await prisma.userNotification.create({
        data: {
          userId: reporterId,
          type: "REPORT_SUBMITTED",
          title: "📋 Report Submitted",
          message: `Your report against "${groupName}" has been submitted and is pending review.${photoUrl ? ' Your photo evidence has been attached.' : ''}`,
          data: {
            reportId: report.id,
            groupId: group.id,
            groupName: groupName,
            reportType: type,
            hasPhoto: !!photoUrl,
            createdAt: report.createdAt
          }
        }
      });

      console.log(`📢 [REPORT] New report created: ${report.id} - ${reporterName} reported ${groupName} for ${type}${photoUrl ? ' (with photo)' : ''}`);

      return {
        success: true,
        message: "Report submitted successfully",
        report: {
          id: report.id,
          type: report.type,
          description: report.description,
          photoUrl: report.photoUrl,
          status: report.status,
          createdAt: report.createdAt,
          group: {
            id: group.id,
            name: group.name
          },
          reporter: {
            id: reporter.id,
            fullName: reporter.fullName
          }
        }
      };

    } catch (error: any) {
      console.error("❌ [REPORT] Error creating report:", error);
      return {
        success: false,
        message: error.message || "Failed to submit report"
      };
    }
  }
}