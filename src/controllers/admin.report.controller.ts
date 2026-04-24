// controllers/admin.report.controller.ts - COMPLETE FIXED VERSION

import { Response } from "express";
import { AdminAuthRequest } from "../middlewares/admin.auth.middleware";
import { AdminReportService } from '../services/admin.report.services';
import prisma from "../prisma";
import { ReportStatus } from "@prisma/client";

export class AdminReportController {
  
  // ========== GET ALL REPORTS (ADMIN ONLY) - FIXED ==========
  static async getAllReports(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;

      if (!adminId) {
        return res.status(401).json({ 
          success: false,
          message: "Admin not authenticated"
        });
      }

      // ✅ Get query parameters
      const { status, search, page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);
      
      const where: any = { deletedAt: null };
      
      // Status filter
      if (status && status !== 'ALL') {
        where.status = status;
      }
      
      // ✅ Search filter
      if (search && typeof search === 'string' && search.trim()) {
        where.OR = [
          { description: { contains: search.trim() } },
          { reporter: { fullName: { contains: search.trim() } } },
          { group: { name: { contains: search.trim() } } }
        ];
      }

      console.log('📥 [Controller] Fetching reports with where:', JSON.stringify(where));

      // Fetch reports
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
          orderBy: { createdAt: 'desc' },
          take: Number(limit),
          skip: skip
        }),
        prisma.report.count({ where })
      ]);

      console.log(`✅ [Controller] Found ${reports.length} reports (total: ${total})`);

      // ✅ CORRECT RESPONSE FORMAT - matches frontend expectations
      return res.json({
        success: true,
        message: "Reports retrieved successfully",
        reports: reports,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: total,
          pages: Math.ceil(total / Number(limit)),
          hasMore: skip + reports.length < total
        }
      });

    } catch (error: any) {
      console.error("❌ Error in getAllReports:", error);
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
        return res.status(404).json({
          success: false,
          message: "Report not found"
        });
      }

      return res.json({
        success: true,
        message: "Report retrieved successfully",
        report: report
      });

    } catch (error: any) {
      console.error("❌ Error in getReportDetails:", error);
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

      const validStatuses = Object.values(ReportStatus);
      if (!validStatuses.includes(status as any)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const result = await AdminReportService.updateReportStatus(
        reportId,
        adminId,
        status as ReportStatus,
        resolutionNotes
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: `Report status updated to ${status}`,
        report: result.report
      });

    } catch (error: any) {
      console.error("❌ Error in updateReportStatus:", error);
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

      const [total, pending, reviewing, resolved, dismissed] = await Promise.all([
        prisma.report.count({ where: { deletedAt: null } }),
        prisma.report.count({ where: { status: 'PENDING', deletedAt: null } }),
        prisma.report.count({ where: { status: 'REVIEWING', deletedAt: null } }),
        prisma.report.count({ where: { status: 'RESOLVED', deletedAt: null } }),
        prisma.report.count({ where: { status: 'DISMISSED', deletedAt: null } })
      ]);

      const byType = await prisma.report.groupBy({
        by: ['type'],
        where: { deletedAt: null },
        _count: true
      });

      return res.json({
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
      });

    } catch (error: any) {
      console.error("❌ Error in getReportStatistics:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== DELETE REPORT (ADMIN ONLY) ==========
  static async deleteReport(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { reportId } = req.params as {reportId:string};
      const { hardDelete } = req.query;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminReportService.deleteReport(
        reportId,
        adminId,
        hardDelete === 'true'
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message
      });

    } catch (error: any) {
      console.error("❌ Error in deleteReport:", error);
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

      const validStatuses = Object.values(ReportStatus);
      if (!validStatuses.includes(status as any)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      const result = await AdminReportService.bulkUpdateReports(
        reportIds,
        adminId,
        status as ReportStatus,
        resolutionNotes
      );

      if (result.success && result.data) {
        return res.json({
          success: true,
          message: `Updated ${result.data.successCount} of ${result.data.totalCount} reports`,
          results: result.data
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message || "Failed to update reports"
        });
      }

    } catch (error: any) {
      console.error("❌ Error in bulkUpdateReports:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== BULK DELETE REPORTS (ADMIN ONLY) ==========
  static async bulkDeleteReports(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { reportIds, hardDelete = false } = req.body;

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

      const result = await AdminReportService.bulkDeleteReports(
        reportIds,
        adminId,
        hardDelete
      );

      if (result.success && result.data) {
        return res.json({
          success: true,
          message: `Deleted ${result.data.successCount} of ${result.data.totalCount} reports`,
          results: result.data
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message || "Failed to delete reports"
        });
      }

    } catch (error: any) {
      console.error("❌ Error in bulkDeleteReports:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}