import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { TaskService } from "../services/task.services";

export class TaskController {
  static async createTask(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params;
      const { title, description, points, frequency, category } = req.body;

      if (!userId) {
        return res.status(401).json({ // FIXED: Use res.status().json()
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

      const result = await TaskService.createTask(
        userId,
        groupId,
        title,
        description,
        points || 1,
        frequency || 'ONCE',
        category
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.status(201).json({ // 201 for created
        success: true,
        message: result.message,
        task: result.task // FIXED: result.task not result.tasks
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
      const { groupId } = req.params;

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

      const result = await TaskService.getGroupTasks(groupId, userId); // FIXED: getGroupTasks (plural)

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        tasks: result.tasks
      });

    } catch (error: any) {
      console.error("TaskController.getGroupTasks error:", error);
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
      const { taskId } = req.params;

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
      const { taskId } = req.params;

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

  // Update a task - ADD THIS METHOD
  static async updateTask(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { taskId } = req.params;
      const { title, description, points, frequency, category } = req.body;

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
        category
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
}