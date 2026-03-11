// controllers/user.report.controller.ts
import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { UserReportService } from "../services/user.report.services";
import prisma from "../prisma";
import { ReportType } from "@prisma/client"; // 👈 ADD THIS IMPORT

export class UserReportController {
  
  // ========== CREATE GROUP REPORT ==========
  static async createGroupReport(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId, type, description } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId || !type || !description) {
        return res.status(400).json({
          success: false,
          message: "Group ID, report type, and description are required"
        });
      }

      // 👇 Validate that type is a valid ReportType enum value
      const validReportTypes = Object.values(ReportType);
      if (!validReportTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid report type. Must be one of: ${validReportTypes.join(', ')}`
        });
      }

      // Check if user is a member of the group
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId
        }
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: "You must be a member of the group to report it"
        });
      }

      // Check if user has already reported this group recently
      const recentReport = await prisma.report.findFirst({
        where: {
          reporterId: userId,
          groupId,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      if (recentReport) {
        return res.status(429).json({
          success: false,
          message: "You have already reported this group recently. Please wait 24 hours before submitting another report."
        });
      }

      const result = await UserReportService.createGroupReport(
        userId,
        groupId,
        type as ReportType, // 👈 Cast to ReportType after validation
        description
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      if (!result.report) {
        return res.status(500).json({
          success: false,
          message: "Report created but no data returned"
        });
      }

      return res.status(201).json({
        success: true,
        message: "Report submitted successfully. Our team will review it.",
        report: {
          id: result.report.id,
          type: result.report.type,
          status: result.report.status,
          createdAt: result.report.createdAt
        }
      });

    } catch (error: any) {
      console.error("Error in createGroupReport:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET MY REPORTS ==========
  static async getMyReports(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const reports = await prisma.report.findMany({
        where: { reporterId: userId },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              avatarUrl: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json({
        success: true,
        reports: reports.map(report => ({
          id: report.id,
          type: report.type,
          description: report.description,
          status: report.status,
          groupName: (report as any).group?.name || 'Unknown Group',
          createdAt: report.createdAt,
          resolvedAt: report.resolvedAt
        }))
      });

    } catch (error: any) {
      console.error("Error in getMyReports:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET SINGLE REPORT ==========
  static async getReport(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { reportId } = req.params as {reportId:string};

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const report = await prisma.report.findFirst({
        where: {
          id: reportId,
          reporterId: userId
        },
        include: {
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
        return res.status(404).json({
          success: false,
          message: "Report not found"
        });
      }

      return res.json({
        success: true,
        report: {
          id: report.id,
          type: report.type,
          description: report.description,
          status: report.status,
          groupName: (report as any).group?.name || 'Unknown Group',
          createdAt: report.createdAt,
          resolvedAt: report.resolvedAt,
          resolutionNotes: report.resolutionNotes
        }
      });

    } catch (error: any) {
      console.error("Error in getReport:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}