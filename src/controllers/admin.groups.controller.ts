// controllers/admin.groups.controller.ts - COMPLETE WITH REPORT ANALYSIS
import { Response } from "express";
import { AdminAuthRequest } from "../middlewares/admin.auth.middleware";
import { AdminGroupsService } from "../services/admin.groups.services";
import { AdminAuditService } from "../services/admin.audit.services";

export class AdminGroupsController {
  
  // ========== GET ALL GROUPS ==========
  static async getGroups(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const {
        search,
        page,
        limit,
        sortBy,
        sortOrder, 
        minMembers,
        maxMembers,
        createdAfter,
        createdBefore
      } = req.query;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
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

      // Log the action
      await AdminAuditService.createLog(
        adminId,
        'ADMIN_VIEWED_GROUPS',
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            filters: {
              search,
              page,
              limit,
              sortBy,
              sortOrder
            }
          }
        }
      );

      return res.json(result);

    } catch (error: any) {
      console.error("Error in getGroups:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET GROUPS WITH REPORT ANALYSIS ==========
  static async getGroupsWithAnalysis(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const {
        search,
        page,
        limit,
        sortBy,
        sortOrder, 
        minMembers,
        maxMembers,
        createdAfter,
        createdBefore
      } = req.query;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
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

      // Log the action
      await AdminAuditService.createLog(
        adminId,
        'ADMIN_VIEWED_GROUPS_WITH_ANALYSIS',
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            filters: {
              search,
              page,
              limit,
              sortBy,
              sortOrder
            }
          }
        }
      );

      return res.json(result);

    } catch (error: any) {
      console.error("Error in getGroupsWithAnalysis:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET GROUP BY ID ==========
  static async getGroupById(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { groupId } = req.params as {groupId:string};

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminGroupsService.getGroupById(groupId);
      
      if (!result.success) {
        return res.status(404).json(result);
      }

      // Log the action
      await AdminAuditService.createLog(
        adminId,
        'ADMIN_VIEWED_GROUP_DETAILS',
        {
          targetUserId: result.group?.createdById,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            groupId,
            groupName: result.group?.name
          }
        }
      );

      return res.json(result);

    } catch (error: any) {
      console.error("Error in getGroupById:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== ANALYZE GROUP REPORTS ==========
  static async analyzeGroupReports(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { groupId } = req.params as {groupId:string};

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminGroupsService.analyzeGroupReports(groupId);

      if (!result.success) {
        return res.status(404).json(result);
      }

      // Log the action
      await AdminAuditService.createLog(
        adminId,
        'ADMIN_ANALYZED_GROUP_REPORTS',
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            groupId,
            reportCount: result.analysis?.reportCount
          }
        }
      );

      return res.json(result);

    } catch (error: any) {
      console.error("Error in analyzeGroupReports:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== APPLY SUGGESTED ACTION ==========
  static async applySuggestedAction(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { groupId } = req.params as {groupId:string};
      const { action, reason } = req.body;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      if (!action) {
        return res.status(400).json({
          success: false,
          message: "Action is required"
        });
      }

      const result = await AdminGroupsService.applySuggestedAction(
        groupId,
        action,
        adminId,
        reason
      );

      // Log the action (already logged in service, but add request context)
      await AdminAuditService.createLog(
        adminId,
        'ADMIN_APPLIED_REPORT_ACTION',
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            groupId,
            action,
            reason
          }
        }
      );

      return res.json(result);

    } catch (error: any) {
      console.error("Error in applySuggestedAction:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== DELETE GROUP ==========
  static async deleteGroup(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { groupId } = req.params as {groupId:string};
      const { hardDelete, reason } = req.body;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      // First get group details for logging
      const groupDetails = await AdminGroupsService.getGroupById(groupId);
      
      const result = await AdminGroupsService.deleteGroup(
        groupId, 
        adminId,
        { 
          hardDelete: hardDelete === true,
          reason 
        }
      );
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      // Log the action (already logged in service, but add request context)
      await AdminAuditService.createLog(
        adminId,
        hardDelete ? 'ADMIN_HARD_DELETED_GROUP' : 'ADMIN_SOFT_DELETED_GROUP',
        {
          targetUserId: groupDetails.success ? groupDetails.group?.createdById : undefined,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            groupId,
            groupName: groupDetails.success ? groupDetails.group?.name : 'Unknown',
            hardDelete: hardDelete === true,
            reason
          }
        }
      );

      return res.json(result);

    } catch (error: any) {
      console.error("Error in deleteGroup:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET GROUP STATISTICS ==========
  static async getGroupStatistics(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { startDate, endDate, minMembers, maxMembers } = req.query;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminGroupsService.getGroupStatistics({
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        minMembers: minMembers ? parseInt(minMembers as string) : undefined,
        maxMembers: maxMembers ? parseInt(maxMembers as string) : undefined
      });

      // Log the action
      await AdminAuditService.createLog(
        adminId,
        'ADMIN_VIEWED_GROUP_STATISTICS',
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            startDate,
            endDate
          }
        }
      );

      return res.json(result);

    } catch (error: any) {
      console.error("Error in getGroupStatistics:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET GROUP MEMBERS ==========
  static async getGroupMembers(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { groupId } = req.params as {groupId:string};
      const {
        role,
        status,
        search,
        page,
        limit
      } = req.query;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminGroupsService.getGroupMembers(groupId, {
        role: role as string,
        status: status as string,
        search: search as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined
      });

      if (!result.success) {
        return res.status(404).json(result);
      }

      // Log the action
      await AdminAuditService.createLog(
        adminId,
        'ADMIN_VIEWED_GROUP_MEMBERS',
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            groupId,
            filters: {
              role,
              status,
              search
            }
          }
        }
      );

      return res.json(result);

    } catch (error: any) {
      console.error("Error in getGroupMembers:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== REMOVE MEMBER FROM GROUP ==========
  static async removeMember(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { groupId, memberId } = req.params as {groupId:string,memberId:string};
      const { reason } = req.body;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const result = await AdminGroupsService.removeMember(
        groupId,
        memberId,
        adminId,
        reason
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Log the action
      await AdminAuditService.createLog(
        adminId,
        'ADMIN_REMOVED_GROUP_MEMBER',
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            groupId,
            memberId,
            reason
          }
        }
      );

      return res.json(result);

    } catch (error: any) {
      console.error("Error in removeMember:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== BULK DELETE GROUPS ==========
  static async bulkDeleteGroups(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { groupIds, hardDelete, reason } = req.body;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Group IDs array is required"
        });
      }

      const result = await AdminGroupsService.bulkDeleteGroups(
        groupIds,
        adminId,
        { hardDelete, reason }
      );

      // Log the bulk action
      await AdminAuditService.createLog(
        adminId,
        hardDelete ? 'ADMIN_BULK_HARD_DELETED_GROUPS' : 'ADMIN_BULK_SOFT_DELETED_GROUPS',
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            groupIds,
            count: groupIds.length,
            hardDelete: hardDelete === true,
            reason,
            results: result.results
          }
        }
      );

      return res.json(result);

    } catch (error: any) {
      console.error("Error in bulkDeleteGroups:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== EXPORT GROUPS DATA ==========
  static async exportGroups(req: AdminAuthRequest, res: Response) {
    try {
      const adminId = req.admin?.id;
      const { format = 'json' } = req.query;

      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      // Get all groups (unpaginated for export)
      const result = await AdminGroupsService.getGroups({
        limit: 1000 // Reasonable limit for export
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Log the export action
      await AdminAuditService.createLog(
        adminId,
        'ADMIN_EXPORTED_GROUPS',
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            format,
            count: result.groups?.length
          }
        }
      );

      if (format === 'csv') {
        // Convert to CSV
        const groups = result.groups || [];
        const csvHeader = 'ID,Name,Description,Member Count,Task Count,Report Count,Created At,Creator\n';
        const csvRows = groups.map(g => 
          `"${g.id}","${g.name}","${g.description || ''}",${g._count.members},${g._count.tasks},${g._count.reports},"${g.createdAt}","${g.creator.fullName}"`
        ).join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=groups-export.csv');
        return res.send(csvHeader + csvRows);
      }

      // Default JSON export
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=groups-export.json');
      return res.json(result.groups);

    } catch (error: any) {
      console.error("Error in exportGroups:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}