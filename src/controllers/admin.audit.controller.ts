// controllers/admin.audit.controller.ts
import { Response } from "express";
import { AdminAuthRequest } from "../middlewares/admin.auth.middleware";
import { AdminAuditService } from "../services/admin.audit.services";

export class AdminAuditController {
  
  // ========== GET AUDIT STATISTICS ==========
  static async getAuditStatistics(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { startDate, endDate } = req.query;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminAuditService.getStatistics({
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      });

      // FIX: Convert any BigInt values to numbers before sending response
      const safeResult = JSON.parse(JSON.stringify(result, (key, value) => 
        typeof value === 'bigint' ? Number(value) : value
      ));

      return res.json(safeResult);

    } catch (error: any) {
      console.error("Error in getAuditStatistics:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET AUDIT LOGS ==========
  static async getAuditLogs(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const {
        adminId: filterAdminId,
        targetUserId,
        action,
        startDate,
        endDate,
        limit = 50,
        offset = 0
      } = req.query;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminAuditService.getLogs({
        adminId: filterAdminId as string,
        targetUserId: targetUserId as string,
        action: action as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: Number(limit),
        offset: Number(offset)
      });

      // Also fix for logs response
      const safeResult = JSON.parse(JSON.stringify(result, (key, value) => 
        typeof value === 'bigint' ? Number(value) : value
      ));

      return res.json(safeResult);

    } catch (error: any) {
      console.error("Error in getAuditLogs:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET SINGLE AUDIT LOG ==========
  static async getAuditLog(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { logId } = req.params as {logId:string};

      if (!adminId) { 
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminAuditService.getLogById(logId);
      
      // Fix BigInt
      const safeResult = JSON.parse(JSON.stringify(result, (key, value) => 
        typeof value === 'bigint' ? Number(value) : value
      ));

      return res.json(safeResult);

    } catch (error: any) {
      console.error("Error in getAuditLog:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}