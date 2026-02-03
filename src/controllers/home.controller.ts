import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { Response } from "express";
import { HomeServices } from "../services/home.services";
import prisma from "../prisma";

export class HomeController {
  static async getHomeData(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const result = await HomeServices.getHomeData(userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }
        
      return res.json({
        success: true,
        message: "Home data retrieved successfully",
        data: result.data
      });
      
    } catch (e: any) {
      console.error("HomeController.getHomeData error:", e);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  static async getWeeklySummary(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const result = await HomeServices.getWeeklySummary(userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }
        
      return res.json({
        success: true,
        message: "Weekly summary retrieved successfully",
        data: result.data
      });
      
    } catch (e: any) {
      console.error("HomeController.getWeeklySummary error:", e);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  static async getDashboardStats(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const now = new Date();
      const currentWeekStart = new Date(now);
      currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + 1);
      currentWeekStart.setHours(0, 0, 0, 0);

      // Get completed assignments with their tasks to calculate points
      const completedAssignments = await prisma.assignment.findMany({
        where: {
          userId: userId,
          completed: true,
          completedAt: { gte: currentWeekStart }
        },
        include: {
          task: {
            select: {
              points: true
            }
          }
        }
      });

      // Calculate total points from completed assignments
      const totalPoints = completedAssignments.reduce((sum, assignment) => 
        sum + (assignment.task.points || 0), 0
      );

      const [
        groupsCount,
        tasksDueThisWeek,
        completedThisWeek,
        recentNotifications
      ] = await Promise.all([
        // Groups count
        prisma.groupMember.count({ where: { userId: userId } }),
        
        // Tasks due this week
        prisma.assignment.count({
          where: {
            userId: userId,
            completed: false,
            weekStart: { lte: now },
            weekEnd: { gte: now }
          }
        }),
        
        // Completed this week
        prisma.assignment.count({
          where: {
            userId: userId,
            completed: true,
            completedAt: { gte: currentWeekStart }
          }
        }),
        
        // Recent notifications
        prisma.userNotification.count({
          where: {
            userId: userId,
            read: false,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }
        })
      ]);

      return res.json({
        success: true,
        message: "Dashboard stats retrieved",
        data: {
          stats: {
            groupsCount,
            tasksDueThisWeek,
            completedThisWeek,
            totalPoints,
            recentNotifications
          },
          currentWeek: {
            start: currentWeekStart,
            end: new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
          },
          timestamp: new Date()
        }
      });
      
    } catch (e: any) {
      console.error("HomeController.getDashboardStats error:", e);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}