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
    
    // Calculate current week boundaries (Monday to Sunday)
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Get completed assignments this week with their tasks to calculate points
    const completedAssignmentsThisWeek = await prisma.assignment.findMany({
      where: {
        userId: userId,
        completed: true,
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

    // Get all completed assignments for total points
    const allCompletedAssignments = await prisma.assignment.findMany({
      where: {
        userId: userId,
        completed: true
      },
      include: {
        task: {
          select: {
            points: true
          }
        }
      }
    });

    // Calculate points - ✅ FIXED: Handle null tasks
    const pointsThisWeek = completedAssignmentsThisWeek.reduce((sum, assignment) => {
      // If task exists, use task.points, otherwise use assignment.points (for deleted tasks)
      const points = assignment.task?.points || assignment.taskPoints || assignment.points || 0;
      return sum + points;
    }, 0);
    
    const totalPoints = allCompletedAssignments.reduce((sum, assignment) => {
      // If task exists, use task.points, otherwise use assignment.points (for deleted tasks)
      const points = assignment.task?.points || assignment.taskPoints || assignment.points || 0;
      return sum + points;
    }, 0);

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
          dueDate: {
            gte: weekStart,
            lte: weekEnd
          }
        }
      }),
      
      // Completed this week
      prisma.assignment.count({
        where: {
          userId: userId,
          completed: true,
          completedAt: { gte: weekStart }
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

    // Also get historical assignments count (deleted tasks with preserved data)
    const historicalAssignmentsCount = await prisma.assignment.count({
      where: {
        userId: userId,
        taskId: null,
        taskTitle: { not: null }
      }
    });

    console.log(`📊 User ${userId} has ${tasksDueThisWeek} tasks due this week`);

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
          historicalAssignments: historicalAssignmentsCount // Track deleted tasks
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