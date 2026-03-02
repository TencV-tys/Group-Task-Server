import { Response } from "express";
import { AdminAuthRequest } from "../middlewares/admin.auth.middleware";
import { AdminUsersService } from "../services/admin.users.service";

export class AdminUsersController {
  
  // ========== GET ALL USERS ==========
  static async getUsers(req: AdminAuthRequest, res: Response) {
    try {
      // Check if admin is authenticated
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const {
        search,
        role,
        status,
        page,
        limit,
        sortBy,
        sortOrder
      } = req.query;

      const filters = {
        search: search as string,
        role: role as string,
        status: status as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc'
      };

      const result = await AdminUsersService.getUsers(filters);

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json({
        success: true,
        message: "Users retrieved successfully",
        data: result.data
      });

    } catch (error: any) {
      console.error("AdminUsersController.getUsers error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET SINGLE USER FOR MODAL ==========
  static async getUserById(req: AdminAuthRequest, res: Response) {
    try {
      // Check if admin is authenticated
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      const { userId } = req.params as { userId: string };

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required"
        });
      }

      const result = await AdminUsersService.getUserById(userId);

      if (!result.success) {
        return res.status(404).json(result);
      }

      return res.json({
        success: true,
        message: "User details retrieved successfully",
        data: result.data
      });

    } catch (error: any) {
      console.error("AdminUsersController.getUserById error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}