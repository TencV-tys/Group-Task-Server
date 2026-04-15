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
    
    // ✅ FIXED: Use UTC for week boundaries (consistent with HomeServices)
    const currentUTCDay = now.getUTCDay(); // 0 = Sunday
    const daysToMonday = currentUTCDay === 0 ? 6 : currentUTCDay - 1;
    
    const weekStart = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysToMonday,
      0, 0, 0, 0
    ));
    
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    // ✅ FIXED: Get completed assignments this week with proper points calculation
    const completedAssignmentsThisWeek = await prisma.assignment.findMany({
      where: {
        userId: userId,
        completed: true,
        verified: true, // ✅ Only count verified assignments for points
        completedAt: { gte: weekStart }
      },
      include: {
        task: {
          select: {
            points: true
          }
        }
      }
    });

    // ✅ FIXED: Get all completed assignments for total points (only verified)
    const allCompletedAssignments = await prisma.assignment.findMany({
      where: {
        userId: userId,
        completed: true,
        verified: true // ✅ Only count verified assignments
      },
      include: {
        task: {
          select: {
            points: true
          }
        }
      }
    });

    // ✅ FIXED: Use assignment.points (already accounts for late penalties)
    const pointsThisWeek = completedAssignmentsThisWeek.reduce((sum, assignment) => {
      return sum + (assignment.points || 0);
    }, 0);
    
    const totalPoints = allCompletedAssignments.reduce((sum, assignment) => {
      return sum + (assignment.points || 0);
    }, 0);

    // ✅ FIXED: Tasks due this week should exclude partially expired with no remaining slots
    const tasksDueThisWeek = await prisma.assignment.count({
      where: {
        userId: userId,
        completed: false,
        expired: false,
        NOT: { partiallyExpired: true }, // ✅ Exclude partially expired with no remaining slots
        dueDate: {
          gte: weekStart,
          lte: weekEnd
        },
        taskId: { not: null }
      }
    });

    const [
      groupsCount,
      completedThisWeek,
      recentNotifications
    ] = await Promise.all([
      prisma.groupMember.count({ where: { userId: userId } }),
      
      // ✅ Completed this week (any completion, regardless of verification)
      prisma.assignment.count({
        where: {
          userId: userId,
          completed: true,
          completedAt: { gte: weekStart }
        }
      }),
      
      // Recent unread notifications
      prisma.userNotification.count({
        where: {
          userId: userId,
          read: false,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      })
    ]);

    const historicalAssignmentsCount = await prisma.assignment.count({
      where: {
        userId: userId,
        taskId: null,
        taskTitle: { not: null }
      }
    });

    console.log(`📊 User ${userId} has ${tasksDueThisWeek} tasks due this week (UTC week: ${weekStart.toISOString()} to ${weekEnd.toISOString()})`);

    return res.json({
      success: true,
      message: "Dashboard stats retrieved",
      data: {
        stats: {
          groupsCount,
          tasksDueThisWeek,
          completedThisWeek,
          pointsThisWeek,
          totalPoints,
          recentNotifications,
          historicalAssignments: historicalAssignmentsCount
        },
        currentWeek: {
          start: weekStart,
          end: weekEnd
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