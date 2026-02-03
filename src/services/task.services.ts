import prisma from "../prisma";
import { TimeOfDay, DayOfWeek } from '@prisma/client';

export class TaskService {
  
  // Helper to calculate week boundaries
  static getWeekBoundaries(weekOffset: number = 0): { weekStart: Date, weekEnd: Date } {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Calculate days to Monday (start of week)
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    
    const monday = new Date(now);
    monday.setDate(monday.getDate() - daysToMonday + (weekOffset * 7));
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    return { weekStart: monday, weekEnd: sunday };
  }

  // Create task with rotation
  static async createTaskWithRotation(
    userId: string,
    groupId: string,
    title: string,
    description?: string,
    points: number = 1,
    frequency: string = 'WEEKLY',
    category?: string,
    timeOfDay?: TimeOfDay,  // This is the enum TYPE
    dayOfWeek?: DayOfWeek,  // This is the enum TYPE
    isRecurring: boolean = true,
    rotationOrder?: number
  ) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId
        }
      });

      if (!membership) {
        return {
          success: false,
          message: "You are not a member in this group"
        };
      }

      if (membership.groupRole !== "ADMIN") {
        return {
          success: false,
          message: "Only group admins can create tasks"
        };
      }

      const group = await prisma.group.findUnique({
        where: { id: groupId }
      });

      if (!group) {
        return {
          success: false,
          message: "Group not found"
        };
      }

      if (!title || !title.trim()) {
        return {
          success: false,
          message: "Task title is required"
        };
      }

      if (points < 1) {
        return {
          success: false,
          message: "Task points must be at least 1"
        };
      }

      // Get next rotation order if not provided
      let finalRotationOrder = rotationOrder;
      if (!finalRotationOrder) {
        const lastTask = await prisma.task.findFirst({
          where: { groupId: groupId },
          orderBy: { rotationOrder: 'desc' }
        });
        finalRotationOrder = (lastTask?.rotationOrder || 0) + 1;
      }

      // Get active members for rotation
      const activeMembers = await prisma.groupMember.findMany({
        where: {
          groupId: groupId,
          isActive: true,
          rotationOrder: { not: null }
        },
        orderBy: { rotationOrder: 'asc' }
      });

      if (activeMembers.length === 0) {
        return {
          success: false,
          message: "No active members in rotation"
        };
      }

      // Determine initial assignee based on rotation order
      const assigneeIndex = (finalRotationOrder - 1) % activeMembers.length;
      const initialAssignee = activeMembers[assigneeIndex];

      if (!initialAssignee) {
        return {
          success: false,
          message: "Could not determine initial assignee"
        };
      }

      // Get current week boundaries
      const { weekStart, weekEnd } = this.getWeekBoundaries();

      // Create the task - FIXED: Remove ? from timeOfDay and dayOfWeek
      const task = await prisma.task.create({
        data: {
          title: title.trim(),
          description: description?.trim() || null,
          points: points,
          frequency: frequency,
          category: category?.trim() || null,
          timeOfDay: timeOfDay || null,  // FIXED: Just timeOfDay, no ?
          dayOfWeek: dayOfWeek || null,  // FIXED: Just dayOfWeek, no ?
          isRecurring: isRecurring,
          rotationOrder: finalRotationOrder,
          currentAssignee: initialAssignee.userId,
          lastAssignedAt: new Date(),
          groupId: groupId,
          createdById: userId
        }
      });

      // Create assignment for current week
      await prisma.assignment.create({
        data: {
          taskId: task.id,
          userId: initialAssignee.userId,
          dueDate: weekEnd,
          rotationWeek: group.currentRotationWeek,
          weekStart: weekStart,
          weekEnd: weekEnd,
          completed: false
        }
      });

      // Fetch complete task with details
      const completeTask = await prisma.task.findUnique({
        where: { id: task.id },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true
            }
          },
          creator: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          },
          assignments: {
            where: {
              rotationWeek: group.currentRotationWeek
            },
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true
                }
              }
            }
          }
        }
      });

      return {
        success: true,
        message: "Task created successfully with rotation",
        task: completeTask
      };

    } catch (e: any) {
      console.error('Error creating task with rotation:', e.message);
      return {
        success: false,
        message: "Error creating task"
      };
    }
  }

  // Get group tasks with rotation
  static async getGroupTasksWithRotation(
    groupId: string,
    userId: string,
    week?: number
  ) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId
        }
      });

      if (!membership) {
        return {
          success: false,
          message: "You are not a member in this group"
        };
      }

      const group = await prisma.group.findUnique({
        where: { id: groupId }
      });

      if (!group) {
        return {
          success: false,
          message: "Group not found"
        };
      }

      const targetWeek = week !== undefined ? week : group.currentRotationWeek;
      const { weekStart, weekEnd } = this.getWeekBoundaries(targetWeek - group.currentRotationWeek);

      const tasks = await prisma.task.findMany({
        where: {
          groupId: groupId
        },
        include: {
          creator: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true
            }
          },
          assignments: {
            where: {
              rotationWeek: targetWeek
            },
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  avatarUrl: true
                }
              }
            }
          }
        },
        orderBy: [
          { rotationOrder: 'asc' },
          { createdAt: 'desc' }
        ]
      });

      const formattedTasks = tasks.map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        points: task.points,
        frequency: task.frequency,
        category: task.category,
        timeOfDay: task.timeOfDay,
        dayOfWeek: task.dayOfWeek,
        isRecurring: task.isRecurring,
        rotationOrder: task.rotationOrder,
        currentAssignee: task.currentAssignee,
        createdAt: task.createdAt,
        creator: task.creator,
        currentAssignment: task.assignments[0] || null,
        isAssignedToUser: task.assignments.some(a => a.userId === userId)
      }));

      return {
        success: true,
        message: "Tasks retrieved successfully",
        tasks: formattedTasks,
        currentWeek: group.currentRotationWeek,
        nextRotation: group.lastRotationUpdate 
          ? new Date(group.lastRotationUpdate.getTime() + 7 * 24 * 60 * 60 * 1000)
          : null
      };

    } catch (e: any) {
      console.error("TaskServices.getGroupTasksWithRotation error:", e);
      return {
        success: false,
        message: e.message || "Error retrieving tasks"
      };
    }
  }

  // Get user's tasks for current or specific week
  static async getUserTasksForWeek(
    groupId: string,
    userId: string,
    week?: number
  ) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId
        }
      });

      if (!membership) {
        return {
          success: false,
          message: "You are not a member in this group"
        };
      }

      const group = await prisma.group.findUnique({
        where: { id: groupId }
      });

      if (!group) {
        return {
          success: false,
          message: "Group not found"
        };
      }

      const targetWeek = week !== undefined ? week : group.currentRotationWeek;
      const { weekStart, weekEnd } = this.getWeekBoundaries(targetWeek - group.currentRotationWeek);

      const assignments = await prisma.assignment.findMany({
        where: {
          userId: userId,
          task: {
            groupId: groupId
          },
          rotationWeek: targetWeek
        },
        include: {
          task: {
            include: {
              creator: {
                select: {
                  id: true,
                  fullName: true,
                  avatarUrl: true
                }
              }
            }
          }
        },
        orderBy: {
          task: {
            rotationOrder: 'asc'
          }
        }
      });

      const tasks = assignments.map(assignment => ({
        id: assignment.task.id,
        title: assignment.task.title,
        description: assignment.task.description,
        points: assignment.task.points,
        frequency: assignment.task.frequency,
        category: assignment.task.category,
        timeOfDay: assignment.task.timeOfDay,
        dayOfWeek: assignment.task.dayOfWeek,
        isRecurring: assignment.task.isRecurring,
        rotationOrder: assignment.task.rotationOrder,
        createdAt: assignment.task.createdAt,
        creator: assignment.task.creator,
        assignment: {
          id: assignment.id,
          dueDate: assignment.dueDate,
          completed: assignment.completed,
          completedAt: assignment.completedAt,
          verified: assignment.verified,
          photoUrl: assignment.photoUrl,
          weekStart: assignment.weekStart,
          weekEnd: assignment.weekEnd,
          rotationWeek: assignment.rotationWeek
        }
      }));

      return {
        success: true,
        message: "Your tasks retrieved successfully",
        tasks: tasks,
        currentWeek: group.currentRotationWeek,
        weekStart: weekStart,
        weekEnd: weekEnd
      };

    } catch (e: any) {
      console.error("TaskServices.getUserTasksForWeek error:", e);
      return {
        success: false,
        message: e.message || "Error retrieving your tasks"
      };
    }
  }

  // Get single task details (updated for rotation)
  static async getTaskDetails(taskId: string, userId: string) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              currentRotationWeek: true,
              members: {
                select: {
                  user: {
                    select: {
                      id: true,
                      fullName: true,
                      avatarUrl: true
                    }
                  },
                  groupRole: true,
                  rotationOrder: true,
                  isActive: true
                }
              }
            }
          },
          creator: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true
            }
          },
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  avatarUrl: true
                }
              }
            },
            orderBy: {
              rotationWeek: 'desc'
            },
            take: 10 // Last 10 assignments
          }
        }
      });

      if (!task) {
        return {
          success: false,
          message: "Task not found"
        };
      }

      const isMember = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: task.groupId
        }
      });

      if (!isMember) {
        return {
          success: false,
          message: "You are not a member of this group"
        };
      }

      // Find user's current assignment
      const userAssignment = task.assignments.find(a => 
        a.userId === userId && 
        a.rotationWeek === task.group.currentRotationWeek
      );

      return {
        success: true,
        message: "Task details retrieved",
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          points: task.points,
          frequency: task.frequency,
          category: task.category,
          timeOfDay: task.timeOfDay,
          dayOfWeek: task.dayOfWeek,
          isRecurring: task.isRecurring,
          rotationOrder: task.rotationOrder,
          currentAssignee: task.currentAssignee,
          lastAssignedAt: task.lastAssignedAt,
          createdAt: task.createdAt,
          group: task.group,
          creator: task.creator,
          assignments: task.assignments,
          userAssignment: userAssignment || null,
          totalAssignments: task.assignments.length
        }
      };

    } catch (error: any) {
      console.error("TaskServices.getTaskDetails error:", error);
      return {
        success: false,
        message: error.message || "Error retrieving task details"
      };
    }
  }

  // Delete a task (admin only)
  static async deleteTask(taskId: string, userId: string) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          group: true
        }
      });

      if (!task) {
        return {
          success: false,
          message: "Task not found"
        };
      }

      const membership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: task.groupId,
          groupRole: "ADMIN"
        }
      });

      if (!membership) {
        return {
          success: false,
          message: "Only group admins can delete tasks"
        };
      }

      await prisma.task.delete({
        where: { id: taskId }
      });

      return {
        success: true,
        message: "Task deleted successfully"
      };

    } catch (error: any) {
      console.error("TaskServices.deleteTask error:", error);
      return {
        success: false,
        message: error.message || "Error deleting task"
      };
    }
  }

  // Update a task (with rotation fields)
  static async updateTask(
    userId: string,
    taskId: string,
    data: {
      title?: string;
      description?: string;
      points?: number;
      frequency?: string;
      category?: string;
      timeOfDay?: TimeOfDay;  // Use enum type
      dayOfWeek?: DayOfWeek;  // Use enum type
      isRecurring?: boolean;
      rotationOrder?: number;
    }
  ) {
    try {
      if (!taskId) {
        return {
          success: false,
          message: "Task ID is required"
        };
      }

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          group: true
        }
      });

      if (!task) {
        return {
          success: false,
          message: "Task not found"
        };
      }

      const membership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: task.groupId,
          groupRole: "ADMIN"
        }
      });

      if (!membership) {
        return {
          success: false,
          message: "Only group admins can update tasks"
        };
      }

      if (data.title && !data.title.trim()) {
        return {
          success: false,
          message: "Task title cannot be empty"
        };
      }

      if (data.points && data.points < 1) {
        return {
          success: false,
          message: "Task points must be at least 1"
        };
      }

      // Prepare update data
      const updateData: any = {};
      
      if (data.title !== undefined) updateData.title = data.title.trim();
      if (data.description !== undefined) {
        updateData.description = data.description.trim() || null;
      }
      if (data.points !== undefined) updateData.points = data.points;
      if (data.frequency !== undefined) updateData.frequency = data.frequency;
      if (data.category !== undefined) {
        updateData.category = data.category.trim() || null;
      }
      if (data.timeOfDay !== undefined) updateData.timeOfDay = data.timeOfDay;
      if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
      if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
      if (data.rotationOrder !== undefined) updateData.rotationOrder = data.rotationOrder;

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: updateData,
        include: {
          group: {
            select: {
              id: true,
              name: true
            }
          },
          creator: {
            select: {
              id: true,
              fullName: true
            }
          }
        }
      });

      return {
        success: true,
        message: "Task updated successfully",
        task: updatedTask
      };

    } catch (e: any) {
      console.error("TaskService.updateTask error:", e);
      return {
        success: false,
        message: e.message || "Error updating task"
      };
    }
  }

  // Rotate tasks for a group
  static async rotateGroupTasks(groupId: string, userId: string) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId,
          groupRole: "ADMIN"
        }
      });

      if (!membership) {
        return {
          success: false,
          message: "Only group admins can rotate tasks"
        };
      }

      const group = await prisma.group.findUnique({
        where: { id: groupId }
      });

      if (!group) {
        return {
          success: false,
          message: "Group not found"
        };
      }

      // Get all recurring tasks in the group
      const tasks = await prisma.task.findMany({
        where: {
          groupId: groupId,
          isRecurring: true
        },
        orderBy: { rotationOrder: 'asc' }
      });

      if (tasks.length === 0) {
        return {
          success: false,
          message: "No recurring tasks to rotate"
        };
      }

      // Get active members for rotation
      const activeMembers = await prisma.groupMember.findMany({
        where: {
          groupId: groupId,
          isActive: true,
          rotationOrder: { not: null }
        },
        orderBy: { rotationOrder: 'asc' }
      });

      if (activeMembers.length === 0) {
        return {
          success: false,
          message: "No active members in rotation"
        };
      }

      const newWeek = group.currentRotationWeek + 1;
      const { weekStart, weekEnd } = this.getWeekBoundaries(1); // Next week

      const rotatedTasks = [];

      // Rotate each task
      for (const task of tasks) {
        // Find current assignee index
        const currentAssigneeIndex = activeMembers.findIndex(
          m => m.userId === task.currentAssignee
        );

        // Calculate next assignee
        const nextAssigneeIndex = (currentAssigneeIndex + 1) % activeMembers.length;
        const nextAssignee = activeMembers[nextAssigneeIndex];

        if (!nextAssignee) {
          console.warn(`No next assignee found for task ${task.id}`);
          continue;
        }

        // Update task
        const updatedTask = await prisma.task.update({
          where: { id: task.id },
          data: {
            currentAssignee: nextAssignee.userId,
            lastAssignedAt: new Date()
          }
        });

        // Create assignment for next week
        const assignment = await prisma.assignment.create({
          data: {
            taskId: task.id,
            userId: nextAssignee.userId,
            dueDate: weekEnd,
            rotationWeek: newWeek,
            weekStart: weekStart,
            weekEnd: weekEnd,
            completed: false
          }
        });

        rotatedTasks.push({
          taskId: task.id,
          taskTitle: task.title,
          previousAssignee: task.currentAssignee,
          newAssignee: nextAssignee.userId
        });
      }

      // Update group rotation week
      await prisma.group.update({
        where: { id: groupId },
        data: {
          currentRotationWeek: newWeek,
          lastRotationUpdate: new Date()
        }
      });

      return {
        success: true,
        message: `Rotated ${rotatedTasks.length} tasks to week ${newWeek}`,
        rotatedTasks: rotatedTasks,
        newWeek: newWeek,
        weekStart: weekStart,
        weekEnd: weekEnd
      };

    } catch (e: any) {
      console.error("TaskServices.rotateGroupTasks error:", e);
      return {
        success: false,
        message: e.message || "Error rotating tasks"
      };
    }
  }

  // Get rotation schedule
  static async getRotationSchedule(
    groupId: string,
    userId: string,
    weeks: number = 4
  ) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId
        }
      });

      if (!membership) {
        return {
          success: false,
          message: "You are not a member in this group"
        };
      }

      const group = await prisma.group.findUnique({
        where: { id: groupId }
      });

      if (!group) {
        return {
          success: false,
          message: "Group not found"
        };
      }

      const schedule = [];

      // Get active members
      const activeMembers = await prisma.groupMember.findMany({
        where: {
          groupId: groupId,
          isActive: true,
          rotationOrder: { not: null }
        },
        orderBy: { rotationOrder: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true
            }
          }
        }
      });

      // Get all recurring tasks
      const tasks = await prisma.task.findMany({
        where: {
          groupId: groupId,
          isRecurring: true
        },
        orderBy: { rotationOrder: 'asc' }
      });

      // Calculate schedule for next X weeks
      for (let weekOffset = 0; weekOffset < weeks; weekOffset++) {
        const weekNumber = group.currentRotationWeek + weekOffset;
        const { weekStart, weekEnd } = this.getWeekBoundaries(weekOffset);

        const weekSchedule: {
          week: number;
          weekStart: Date;
          weekEnd: Date;
          tasks: Array<{
            taskId: string;
            taskTitle: string;
            assignee: {
              id: string;
              name: string;
              avatarUrl: string | null;
            } | null;
            timeOfDay: TimeOfDay | null;
            dayOfWeek: DayOfWeek | null;
            points: number;
          }>;
        } = {
          week: weekNumber,
          weekStart: weekStart,
          weekEnd: weekEnd,
          tasks: []
        };

        for (const task of tasks) {
          // Calculate assignee for this week
          const taskIndex = (task.rotationOrder || 1) - 1;
          const assigneeIndex = (taskIndex + weekOffset) % activeMembers.length;
          const assignee = activeMembers[assigneeIndex];

          weekSchedule.tasks.push({
            taskId: task.id,
            taskTitle: task.title,
            assignee: assignee ? {
              id: assignee.userId,
              name: assignee.user.fullName,
              avatarUrl: assignee.user.avatarUrl
            } : null,
            timeOfDay: task.timeOfDay,
            dayOfWeek: task.dayOfWeek,
            points: task.points
          });
        }

        schedule.push(weekSchedule);
      }

      return {
        success: true,
        message: "Rotation schedule retrieved",
        schedule: schedule,
        currentWeek: group.currentRotationWeek,
        totalMembers: activeMembers.length,
        totalTasks: tasks.length
      };

    } catch (e: any) {
      console.error("TaskServices.getRotationSchedule error:", e);
      return {
        success: false,
        message: e.message || "Error retrieving rotation schedule"
      };
    }
  }
}