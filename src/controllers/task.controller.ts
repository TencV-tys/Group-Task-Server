import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { TaskService } from "../services/task.services";
import { TaskExecutionFrequency, DayOfWeek } from '@prisma/client';

export class TaskController {
  
  static async createTask(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { 
        title, 
        description, 
        points = 1,
        category,
        
        // New fields
        executionFrequency = 'WEEKLY' as TaskExecutionFrequency,
        scheduledTime,
        timeFormat = '12h',
        selectedDays,
        dayOfWeek,
        isRecurring = true,
        
        // Rotation settings
        rotationMemberIds,
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

      // Convert points to number safely
      const pointsNumber = points !== undefined && points !== null 
        ? parseInt(String(points)) 
        : 1;

      // Create task data object
      const taskData = {
        title: title.trim(),
        points: Math.max(1, pointsNumber),
        executionFrequency,
        scheduledTime: scheduledTime ?? undefined,
        timeFormat,
        selectedDays: selectedDays ? this.validateSelectedDays(selectedDays) : undefined,
        dayOfWeek: dayOfWeek ?? undefined,
        isRecurring,
        rotationMemberIds: rotationMemberIds ?? undefined,
        rotationOrder: rotationOrder !== undefined ? parseInt(String(rotationOrder)) : undefined,
        description: description ? description.trim() : undefined,
        category: category ? category.trim() : undefined
      };

      const result = await TaskService.createTask(
        userId,
        groupId,
        taskData
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

    } catch (error: any) {
      console.error("TaskController.createTask error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Helper method to validate selected days
  private static validateSelectedDays(days: any): DayOfWeek[] | undefined {
    if (!Array.isArray(days)) return undefined;
    
    const validDays = Object.values(DayOfWeek);
    const filtered = days.filter((day: string) => 
      validDays.includes(day as DayOfWeek)
    );
    
    return filtered.length > 0 ? filtered as DayOfWeek[] : undefined;
  }

  static async getGroupTasks(req: UserAuthRequest, res: Response) {
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

      const weekNumber = week !== undefined ? parseInt(String(week)) : undefined;
      
      const result = await TaskService.getGroupTasks(
        groupId, 
        userId,
        weekNumber
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
        nextRotation: result.nextRotation,
        weekStart: result.weekStart,
        weekEnd: result.weekEnd
      });

    } catch (error: any) {
      console.error("TaskController.getGroupTasks error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

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

      const weekNumber = week !== undefined ? parseInt(String(week)) : undefined;
      
      const result = await TaskService.getUserTasks(
        groupId,
        userId,
        weekNumber
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

  static async updateTask(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { taskId } = req.params as { taskId: string };
      const data = req.body;

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

      // Validate and prepare update data
      const updateData: any = {};
      
      // Add fields only if they are explicitly provided (not undefined)
      if (data.title !== undefined) updateData.title = data.title.trim();
      if (data.description !== undefined) {
        updateData.description = data.description?.trim() || null;
      }
      if (data.points !== undefined) {
        const pointsValue = parseInt(String(data.points));
        updateData.points = !isNaN(pointsValue) ? pointsValue : 1;
      }
      if (data.executionFrequency !== undefined) updateData.executionFrequency = data.executionFrequency;
      if (data.scheduledTime !== undefined) updateData.scheduledTime = data.scheduledTime;
      if (data.timeFormat !== undefined) updateData.timeFormat = data.timeFormat;
      if (data.selectedDays !== undefined) {
        updateData.selectedDays = data.selectedDays ? this.validateSelectedDays(data.selectedDays) : null;
      }
      if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
      if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
      if (data.category !== undefined) {
        updateData.category = data.category?.trim() || null;
      }
      if (data.rotationOrder !== undefined) {
        const orderValue = parseInt(String(data.rotationOrder));
        updateData.rotationOrder = !isNaN(orderValue) ? orderValue : undefined;
      }
      if (data.rotationMemberIds !== undefined) updateData.rotationMemberIds = data.rotationMemberIds;

      const result = await TaskService.updateTask(userId, taskId, updateData);

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
        newWeek: result.newWeek,
        weekStart: result.weekStart,
        weekEnd: result.weekEnd
      });

    } catch (error: any) {
      console.error("TaskController.rotateTasks error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  static async getRotationSchedule(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { weeks = 4 } = req.query;

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

      const weeksValue = parseInt(String(weeks));
      const weeksNumber = !isNaN(weeksValue) ? weeksValue : 4;
      
      const result = await TaskService.getRotationSchedule(
        groupId, 
        userId,
        weeksNumber
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
        currentWeek: result.currentWeek,
        totalTasks: result.totalTasks
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