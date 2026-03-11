
// controllers/admin.report.controller.ts
import { Response } from "express";
import { AdminAuthRequest } from "../middlewares/admin.auth.middleware";
import { AdminReportService } from '../services/admin.report.services';
import prisma from "../prisma";
import { ReportStatus } from "@prisma/client"; // 👈 ADD THIS IMPORT

export class AdminReportController {
  
  // ========== GET ALL REPORTS (ADMIN ONLY) ==========
  static async getAllReports(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { status, limit = 50, offset = 0 } = req.query;

      const where: any = {};
      
      // 👇 Validate status if provided
      if (status) {
        const validStatuses = Object.values(ReportStatus);
        if (!validStatuses.includes(status as any)) {
          return res.status(400).json({
            success: false,
            message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
          });
        }
        where.status = status;
      }

      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
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
          },
          orderBy: [
            { status: 'asc' },
            { createdAt: 'desc' }
          ],
          take: Number(limit),
          skip: Number(offset)
        }),
        prisma.report.count({ where })
      ]);

      return res.json({
        success: true,
        reports,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: total > Number(offset) + Number(limit)
        }
      });

    } catch (error: any) {
      console.error("Error in getAllReports:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET SINGLE REPORT DETAILS (ADMIN ONLY) ==========
  static async getReportDetails(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { reportId } = req.params as {reportId:string};

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

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
        return res.status(404).json({
          success: false,
          message: "Report not found"
        });
      }

      return res.json({
        success: true,
        report
      });

    } catch (error: any) {
      console.error("Error in getReportDetails:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== UPDATE REPORT STATUS (ADMIN ONLY) ==========
  static async updateReportStatus(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { reportId } = req.params as {reportId:string};
      const { status, resolutionNotes } = req.body;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: "Status is required"
        });
      }

      // 👇 Validate status against ReportStatus enum
      const validStatuses = Object.values(ReportStatus);
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const result = await AdminReportService.updateReportStatus(
        reportId,
        adminId,
        status, // Now it's validated as ReportStatus
        resolutionNotes
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      // 👇 Add null check for result.report
      if (!result.report) {
        return res.status(500).json({
          success: false,
          message: "Report updated but no data returned"
        });
      }

      return res.json({
        success: true,
        message: "Report status updated successfully",
        report: {
          id: result.report.id,
          status: result.report.status,
          resolvedAt: result.report.resolvedAt,
          resolutionNotes: result.report.resolutionNotes
        }
      });

    } catch (error: any) {
      console.error("Error in updateReportStatus:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== BULK UPDATE REPORTS (ADMIN ONLY) ==========
  static async bulkUpdateReports(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { reportIds, status, resolutionNotes } = req.body;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Report IDs are required"
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: "Status is required"
        });
      }

      // 👇 Validate status against ReportStatus enum
      const validStatuses = Object.values(ReportStatus);
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const results = await AdminReportService.bulkUpdateReports(
        reportIds,
        adminId,
        status, // Now it's validated as ReportStatus
        resolutionNotes
      );

      return res.json({
        success: true,
        message: `Updated ${results.successCount} of ${results.totalCount} reports`,
        results
      });

    } catch (error: any) {
      console.error("Error in bulkUpdateReports:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET REPORT STATISTICS (ADMIN ONLY) ==========
  static async getReportStatistics(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const [
        totalReports,
        pendingReports,
        reviewingReports,
        resolvedReports,
        dismissedReports,
        reportsByType,
        reportsByGroup,
        recentReports
      ] = await Promise.all([
        prisma.report.count(),
        prisma.report.count({ where: { status: 'PENDING' } }),
        prisma.report.count({ where: { status: 'REVIEWING' } }),
        prisma.report.count({ where: { status: 'RESOLVED' } }),
        prisma.report.count({ where: { status: 'DISMISSED' } }),
        prisma.report.groupBy({
          by: ['type'],
          _count: true
        }),
        prisma.report.groupBy({
          by: ['groupId'],
          _count: true,
          orderBy: {
            _count: {
              groupId: 'desc'
            }
          },
          take: 5
        }),
        prisma.report.findMany({
          where: { status: 'PENDING' },
          include: {
            reporter: {
              select: { fullName: true }
            },
            group: {
              select: { name: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        })
      ]);

      // Get group names for top reported groups
      const topGroups = await Promise.all(
        reportsByGroup.map(async (item) => {
          const group = await prisma.group.findUnique({
            where: { id: item.groupId },
            select: { name: true }
          });
          return {
            groupId: item.groupId,
            groupName: group?.name || 'Unknown Group',
            reportCount: item._count
          };
        })
      );

      return res.json({
        success: true,
        statistics: {
          overview: {
            total: totalReports,
            pending: pendingReports,
            reviewing: reviewingReports,
            resolved: resolvedReports,
            dismissed: dismissedReports,
            resolutionRate: totalReports > 0 
              ? Math.round(((resolvedReports + dismissedReports) / totalReports) * 100) 
              : 0
          },
          byType: reportsByType.map(item => ({
            type: item.type,
            count: item._count
          })),
          topReportedGroups: topGroups,
          recentReports: recentReports.map(r => ({
            id: r.id,
            type: r.type,
            status: r.status,
            reporterName: (r as any).reporter?.fullName || 'Unknown User',
            groupName: (r as any).group?.name || 'Unknown Group',
            createdAt: r.createdAt
          }))
        }
      });

    } catch (error: any) {
      console.error("Error in getReportStatistics:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}