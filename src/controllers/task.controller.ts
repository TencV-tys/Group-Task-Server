import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { TaskService } from "../services/task.services";

export class TaskController {
  static async createTask(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { 
        title, 
        description, 
        points, 
        frequency = 'WEEKLY', // Default to WEEKLY for rotation
        category,
        timeOfDay,
        dayOfWeek,
        isRecurring = true,
        rotationOrder
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      if (!title || !title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Task title is required"
        });
      }

      const result = await TaskService.createTaskWithRotation(
        userId,
        groupId,
        title.trim(),
        description?.trim(),
        points || 1,
        frequency,
        category?.trim(),
        timeOfDay,
        dayOfWeek,
        isRecurring,
        rotationOrder
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.status(201).json({
        success: true,
        message: result.message,
        task: result.task
      });

    } catch (e: any) {
      console.error("Creating task error", e);
      return res.status(500).json({
        success: false,
        message: e.message || "Internal server error"
      });
    }
  }

  // Get all tasks in a group
  static async getGroupTasks(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { week } = req.query; // Optional: Get tasks for specific week

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await TaskService.getGroupTasksWithRotation(
        groupId, 
        userId,
        week ? parseInt(week as string) : undefined
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        tasks: result.tasks,
        currentWeek: result.currentWeek,
        nextRotation: result.nextRotation
      });

    } catch (error: any) {
      console.error("TaskController.getGroupTasks error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get tasks assigned to current user in a group
  static async getMyTasks(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { week } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await TaskService.getUserTasksForWeek(
        groupId,
        userId,
        week ? parseInt(week as string) : undefined
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        tasks: result.tasks,
        currentWeek: result.currentWeek,
        weekStart: result.weekStart,
        weekEnd: result.weekEnd
      });

    } catch (error: any) {
      console.error("TaskController.getMyTasks error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get single task details
  static async getTaskDetails(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { taskId } = req.params as { taskId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!taskId) {
        return res.status(400).json({
          success: false,
          message: "Task ID is required"
        });
      }

      const result = await TaskService.getTaskDetails(taskId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        task: result.task
      });

    } catch (error: any) {
      console.error("TaskController.getTaskDetails error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Delete a task
  static async deleteTask(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { taskId } = req.params as { taskId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!taskId) {
        return res.status(400).json({
          success: false,
          message: "Task ID is required"
        });
      }

      const result = await TaskService.deleteTask(taskId, userId);

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
      console.error("TaskController.deleteTask error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Update a task
  static async updateTask(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { taskId } = req.params as { taskId: string };
      const { 
        title, 
        description, 
        points, 
        frequency, 
        category,
        timeOfDay,
        dayOfWeek,
        isRecurring,
        rotationOrder
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!taskId) {
        return res.status(400).json({
          success: false,
          message: "Task ID is required"
        });
      }

      const result = await TaskService.updateTask(userId, taskId, {
        title,
        description,
        points,
        frequency,
        category,
        timeOfDay,
        dayOfWeek,
        isRecurring,
        rotationOrder
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        task: result.task
      });

    } catch (error: any) {
      console.error("TaskController.updateTask error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Rotate tasks for a group (admin only)
  static async rotateTasks(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await TaskService.rotateGroupTasks(groupId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        rotatedTasks: result.rotatedTasks,
        newWeek: result.newWeek
      });

    } catch (error: any) {
      console.error("TaskController.rotateTasks error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get rotation schedule
  static async getRotationSchedule(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { weeks = 4 } = req.query; // Get schedule for next X weeks

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await TaskService.getRotationSchedule(
        groupId, 
        userId,
        parseInt(weeks as string)
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        schedule: result.schedule,
        currentWeek: result.currentWeek
      });

    } catch (error: any) {
      console.error("TaskController.getRotationSchedule error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}