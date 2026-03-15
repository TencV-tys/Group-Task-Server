import { Response } from "express";
import { AdminAuthRequest } from "../middlewares/admin.auth.middleware";
import { AdminUsersService } from "../services/admin.users.service";
import prisma from "../prisma";

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

  // ========== GET USER STATISTICS ==========
  static async getUserStats(req: AdminAuthRequest, res: Response) {
    try {
      // Check if admin is authenticated
      const adminId = req.admin?.id;
      
      if (!adminId) {
        return res.status(401).json({
          success: false,
          message: "Admin not authenticated"
        });
      }

      // Get counts from database
      const [
        total,
        active,
        suspended,
        groupAdmins,  // 👈 Changed from 'admins' to 'groupAdmins'
        newToday,
        newThisWeek,
        newThisMonth
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { roleStatus: 'ACTIVE' } }),
        prisma.user.count({ where: { roleStatus: 'SUSPENDED' } }),
        // Count DISTINCT users who are admins of any group
        prisma.groupMember.findMany({
          where: { groupRole: 'ADMIN' },
          select: { userId: true },
          distinct: ['userId']
        }).then(admins => admins.length),
        // New users today
        prisma.user.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        }),
        // New users this week
        prisma.user.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setDate(new Date().getDate() - 7))
            }
          }
        }),
        // New users this month
        prisma.user.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setMonth(new Date().getMonth() - 1))
            }
          }
        })
      ]);

      return res.json({
        success: true,
        message: "User statistics retrieved successfully",
        data: {
          total,
          active,
          suspended,
          groupAdmins,  // 👈 Now returns the correct count
          newToday,
          newThisWeek,
          newThisMonth
        }
      });

    } catch (error: any) {
      console.error("AdminUsersController.getUserStats error:", error);
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