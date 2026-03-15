// controllers/admin.groups.controller.ts - CLEANED UP
import { Response } from "express";
import { AdminAuthRequest } from "../middlewares/admin.auth.middleware";
import { AdminGroupsService } from "../services/admin.groups.services";

export class AdminGroupsController {
  
  // ========== GET ALL GROUPS ==========
  static async getGroups(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { search, page, limit, sortBy, sortOrder, minMembers, maxMembers, createdAfter, createdBefore } = req.query;

      if (!adminId) {
        return res.status(401).json({ success: false, message: "Admin not authenticated" });
      }

      const result = await AdminGroupsService.getGroups({
        search: search as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        minMembers: minMembers ? parseInt(minMembers as string) : undefined,
        maxMembers: maxMembers ? parseInt(maxMembers as string) : undefined,
        createdAfter: createdAfter ? new Date(createdAfter as string) : undefined,
        createdBefore: createdBefore ? new Date(createdBefore as string) : undefined
      });

      return res.json(result);

    } catch (error: any) {
      console.error("Error in getGroups:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  // ========== GET GROUPS WITH ANALYSIS ==========
  static async getGroupsWithAnalysis(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { search, page, limit, sortBy, sortOrder, minMembers, maxMembers, createdAfter, createdBefore } = req.query;

      if (!adminId) {
        return res.status(401).json({ success: false, message: "Admin not authenticated" });
      }

      const result = await AdminGroupsService.getGroupsWithAnalysis({
        search: search as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        minMembers: minMembers ? parseInt(minMembers as string) : undefined,
        maxMembers: maxMembers ? parseInt(maxMembers as string) : undefined,
        createdAfter: createdAfter ? new Date(createdAfter as string) : undefined,
        createdBefore: createdBefore ? new Date(createdBefore as string) : undefined
      });

      return res.json(result);

    } catch (error: any) {
      console.error("Error in getGroupsWithAnalysis:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  // ========== GET GROUP BY ID ==========
  static async getGroupById(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { groupId } = req.params as {groupId:string};

      if (!adminId) {
        return res.status(401).json({ success: false, message: "Admin not authenticated" });
      }

      const result = await AdminGroupsService.getGroupById(groupId);
      
      if (!result.success) {
        return res.status(404).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("Error in getGroupById:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  // ========== ANALYZE GROUP REPORTS ==========
  static async analyzeGroupReports(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { groupId } = req.params as {groupId:string};

      if (!adminId) {
        return res.status(401).json({ success: false, message: "Admin not authenticated" });
      }

      const result = await AdminGroupsService.analyzeGroupReports(groupId);

      if (!result.success) {
        return res.status(404).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("Error in analyzeGroupReports:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  // ========== APPLY ACTION ==========
  static async applyAction(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { groupId } = req.params as {groupId:string};
      const { action, reason } = req.body;

      if (!adminId) {
        return res.status(401).json({ success: false, message: "Admin not authenticated" });
      }

      if (!action) {
        return res.status(400).json({ success: false, message: "Action is required" });
      }

      const result = await AdminGroupsService.applyAction(groupId, action, adminId, reason);

      return res.json(result);

    } catch (error: any) {
      console.error("Error in applyAction:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  // ========== DELETE GROUP ==========
  static async deleteGroup(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { groupId } = req.params as {groupId:string};
      const { hardDelete, reason } = req.body;

      if (!adminId) {
        return res.status(401).json({ success: false, message: "Admin not authenticated" });
      }

      const result = await AdminGroupsService.deleteGroup(groupId, adminId, { hardDelete, reason });
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);

    } catch (error: any) {
      console.error("Error in deleteGroup:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  // ========== GET GROUP STATISTICS ==========
  static async getGroupStatistics(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;

      if (!adminId) {
        return res.status(401).json({ success: false, message: "Admin not authenticated" });
      }

      const result = await AdminGroupsService.getGroupStatistics();

      return res.json(result);

    } catch (error: any) {
      console.error("Error in getGroupStatistics:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}