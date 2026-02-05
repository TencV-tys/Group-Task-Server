import prisma from "../prisma";
import { DayOfWeek, TaskExecutionFrequency } from '@prisma/client';

export class TaskService {
  
  // Helper to safely parse JSON arrays
  private static safeJsonParse<T>(value: any): T[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [];
  }

  // Helper to calculate week boundaries
  static getWeekBoundaries(weekOffset: number = 0): { weekStart: Date, weekEnd: Date } {
    const now = new Date();
    const currentDay = now.getDay();
    
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;
    
    const monday = new Date(now);
    monday.setDate(monday.getDate() - daysToMonday + (weekOffset * 7));
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    return { weekStart: monday, weekEnd: sunday };
  }

  // Helper to calculate due date with specific time
  static calculateDueDate(day: DayOfWeek, scheduledTime?: string): Date {
    const now = new Date();
    const dueDate = new Date();
    
    const days = {
      MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4,
      FRIDAY: 5, SATURDAY: 6, SUNDAY: 0
    };
    
    const targetDay = days[day];
    const currentDay = now.getDay();
    
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0) daysToAdd += 7;
    
    dueDate.setDate(dueDate.getDate() + daysToAdd);
    
    if (scheduledTime) {
      const timeParts = scheduledTime.split(':');
      const hours = Number(timeParts[0]) || 18;
      const minutes = Number(timeParts[1]) || 0;
      dueDate.setHours(hours, minutes, 0, 0);
    } else {
      dueDate.setHours(18, 0, 0, 0);
    }
    
    return dueDate;
  }

  // Create task with all new features
  static async createTask(
    userId: string,
    groupId: string,
    data: {
      title: string;
      description?: string;
      points?: number;
      category?: string;
      executionFrequency: TaskExecutionFrequency;
      scheduledTime?: string;
      timeFormat?: string;
      selectedDays?: DayOfWeek[];
      dayOfWeek?: DayOfWeek;
      isRecurring?: boolean;
      rotationMemberIds?: string[];
      rotationOrder?: number;
    }
  ) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId }
      });

      if (!membership) {
        return { success: false, message: "You are not a member in this group" };
      }

      if (membership.groupRole !== "ADMIN") {
        return { success: false, message: "Only group admins can create tasks" };
      }

      const group = await prisma.group.findUnique({ where: { id: groupId } });
      if (!group) {
        return { success: false, message: "Group not found" };
      }

      if (!data.title?.trim()) {
        return { success: false, message: "Task title is required" };
      }

      const pointsValue = data.points !== undefined ? Math.max(1, Number(data.points)) : 1;

      if (data.executionFrequency === 'DAILY' && !data.scheduledTime) {
        return { success: false, message: "Daily tasks require a scheduled time" };
      }

      if (data.executionFrequency === 'WEEKLY' && 
          !data.selectedDays?.length && 
          !data.dayOfWeek) {
        return { success: false, message: "Weekly tasks require at least one day selection" };
      }

      let targetMemberIds = data.rotationMemberIds || [];
      let rotationMembers = [];

      if (targetMemberIds.length > 0) {
        const validMembers = await prisma.groupMember.findMany({
          where: { groupId, userId: { in: targetMemberIds }, isActive: true },
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          orderBy: { rotationOrder: 'asc' }
        });

        if (validMembers.length !== targetMemberIds.length) {
          return { success: false, message: "Some selected members are not in this group or are inactive" };
        }
        rotationMembers = validMembers;
      } else {
        rotationMembers = await prisma.groupMember.findMany({
          where: { groupId, isActive: true },
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          orderBy: { rotationOrder: 'asc' }
        });
      }

      if (rotationMembers.length === 0) {
        return { success: false, message: "No active members available for rotation" };
      }

      let finalRotationOrder: number;
      if (data.rotationOrder !== undefined) {
        finalRotationOrder = Math.max(1, Number(data.rotationOrder));
      } else {
        const lastTask = await prisma.task.findFirst({
          where: { groupId },
          orderBy: { rotationOrder: 'desc' }
        });
        finalRotationOrder = (lastTask?.rotationOrder || 0) + 1;
      }

      const safeOrder = finalRotationOrder;
      const assigneeIndex = Math.max(0, (safeOrder - 1) % rotationMembers.length);
      const initialAssignee = rotationMembers[assigneeIndex];

      if (!initialAssignee) {
        return { success: false, message: "Could not determine initial assignee" };
      }

      let selectedDaysArray: DayOfWeek[] = [];
      if (data.executionFrequency === 'WEEKLY') {
        if (data.selectedDays && data.selectedDays.length > 0) {
          selectedDaysArray = data.selectedDays;
        } else if (data.dayOfWeek) {
          selectedDaysArray = [data.dayOfWeek];
        }
      }

      const taskData: any = {
        title: data.title.trim(),
        description: data.description?.trim() || null,
        points: pointsValue,
        executionFrequency: data.executionFrequency,
        scheduledTime: data.scheduledTime || null,
        timeFormat: data.timeFormat || '12h',
        dayOfWeek: data.dayOfWeek || null,
        isRecurring: data.isRecurring !== false,
        category: data.category?.trim() || null,
        rotationOrder: safeOrder,
        currentAssignee: initialAssignee.userId,
        lastAssignedAt: new Date(),
        rotationMembers: rotationMembers.map(member => ({
          userId: member.userId,
          fullName: member.user.fullName,
          avatarUrl: member.user.avatarUrl,
          rotationOrder: member.rotationOrder
        })),
        groupId,
        createdById: userId
      };

      if (selectedDaysArray.length > 0) {
        taskData.selectedDays = selectedDaysArray;
      }

      const task = await prisma.task.create({ data: taskData });

      const { weekStart, weekEnd } = this.getWeekBoundaries();
      
      if (data.executionFrequency === 'DAILY' && data.scheduledTime) {
        for (let i = 0; i < 7; i++) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + i);
          const timeParts = data.scheduledTime.split(':');
          const hours = Number(timeParts[0]) || 18;
          const minutes = Number(timeParts[1]) || 0;
          dueDate.setHours(hours, minutes, 0, 0);
          
          await prisma.assignment.create({
            data: {
              taskId: task.id,
              userId: initialAssignee.userId,
              dueDate,
              rotationWeek: group.currentRotationWeek,
              weekStart,
              weekEnd,
              assignmentDay: this.getDayOfWeekFromIndex(i),
              completed: false
            }
          });
        }
      } else if (data.executionFrequency === 'WEEKLY') {
        for (const day of selectedDaysArray) {
          const dueDate = this.calculateDueDate(day, data.scheduledTime);
          
          await prisma.assignment.create({
            data: {
              taskId: task.id,
              userId: initialAssignee.userId,
              dueDate,
              rotationWeek: group.currentRotationWeek,
              weekStart,
              weekEnd,
              assignmentDay: day,
              completed: false
            }
          });
        }
      }

      const completeTask = await prisma.task.findUnique({
        where: { id: task.id },
        include: {
          group: { select: { id: true, name: true, description: true } },
          creator: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
          assignments: {
            where: { rotationWeek: group.currentRotationWeek },
            include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
            orderBy: { dueDate: 'asc' }
          }
        }
      });

      return {
        success: true,
        message: "Task created successfully",
        task: completeTask
      };

    } catch (error: any) {
      console.error('TaskService.createTask error:', error);
      return { success: false, message: error.message || "Error creating task" };
    }
  }

  // Helper to get DayOfWeek from index
  private static getDayOfWeekFromIndex(index: number): DayOfWeek {
    const days: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return days[index] as DayOfWeek;
  }

  // Get group tasks
  static async getGroupTasks(groupId: string, userId: string, week?: number) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId }
      });

      if (!membership) {
        return { success: false, message: "You are not a member in this group" };
      }

      const group = await prisma.group.findUnique({ where: { id: groupId } });
      if (!group) {
        return { success: false, message: "Group not found" };
      }

      const targetWeek = week !== undefined ? Number(week) : group.currentRotationWeek;
      const weekOffset = targetWeek - group.currentRotationWeek;
      const { weekStart, weekEnd } = this.getWeekBoundaries(weekOffset);

      const tasks = await prisma.task.findMany({
        where: { groupId },
        include: {
          creator: { select: { id: true, fullName: true, avatarUrl: true } },
          assignments: {
            where: { rotationWeek: targetWeek },
            include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
            orderBy: { dueDate: 'asc' }
          }
        },
        orderBy: [{ rotationOrder: 'asc' }, { createdAt: 'desc' }]
      });

      const formattedTasks = tasks.map(task => {
        const settings = task as any;
        const userAssignment = task.assignments.find(a => a.userId === userId);
        
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          points: task.points,
          executionFrequency: task.executionFrequency,
          scheduledTime: task.scheduledTime,
          timeFormat: task.timeFormat,
          selectedDays: this.safeJsonParse<DayOfWeek>(task.selectedDays),
          dayOfWeek: task.dayOfWeek,
          isRecurring: task.isRecurring,
          category: task.category,
          rotationOrder: task.rotationOrder,
          currentAssignee: task.currentAssignee,
          lastAssignedAt: task.lastAssignedAt,
          createdAt: task.createdAt,
          creator: task.creator,
          assignments: task.assignments,
          userAssignment: userAssignment || null,
          isAssignedToUser: !!userAssignment,
          rotationMembers: this.safeJsonParse<any>(settings.rotationMembers),
          totalAssignments: task.assignments.length
        };
      });

      return {
        success: true,
        message: "Tasks retrieved successfully",
        tasks: formattedTasks,
        currentWeek: group.currentRotationWeek,
        nextRotation: group.lastRotationUpdate 
          ? new Date(group.lastRotationUpdate.getTime() + 7 * 24 * 60 * 60 * 1000)
          : null,
        weekStart,
        weekEnd
      };

    } catch (error: any) {
      console.error("TaskService.getGroupTasks error:", error);
      return { success: false, message: error.message || "Error retrieving tasks" };
    }
  }

  // Get user's tasks
  static async getUserTasks(groupId: string, userId: string, week?: number) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId }
      });

      if (!membership) {
        return { success: false, message: "You are not a member in this group" };
      }

      const group = await prisma.group.findUnique({ where: { id: groupId } });
      if (!group) {
        return { success: false, message: "Group not found" };
      }

      const targetWeek = week !== undefined ? Number(week) : group.currentRotationWeek;
      const weekOffset = targetWeek - group.currentRotationWeek;
      const { weekStart, weekEnd } = this.getWeekBoundaries(weekOffset);

      const assignments = await prisma.assignment.findMany({
        where: { userId, task: { groupId }, rotationWeek: targetWeek },
        include: {
          task: {
            include: { creator: { select: { id: true, fullName: true, avatarUrl: true } } }
          }
        },
        orderBy: { dueDate: 'asc' }
      });

      const tasks = assignments.map(assignment => ({
        id: assignment.task.id,
        title: assignment.task.title,
        description: assignment.task.description,
        points: assignment.task.points,
        executionFrequency: assignment.task.executionFrequency,
        scheduledTime: assignment.task.scheduledTime,
        timeFormat: assignment.task.timeFormat,
        selectedDays: this.safeJsonParse<DayOfWeek>(assignment.task.selectedDays),
        dayOfWeek: assignment.task.dayOfWeek,
        isRecurring: assignment.task.isRecurring,
        category: assignment.task.category,
        rotationOrder: assignment.task.rotationOrder,
        createdAt: assignment.task.createdAt,
        creator: assignment.task.creator,
        assignment: {
          id: assignment.id,
          dueDate: assignment.dueDate,
          assignmentDay: assignment.assignmentDay,
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
        tasks,
        currentWeek: group.currentRotationWeek,
        weekStart,
        weekEnd
      };

    } catch (error: any) {
      console.error("TaskService.getUserTasks error:", error);
      return { success: false, message: error.message || "Error retrieving your tasks" };
    }
  }

  // Get task details
  static async getTaskDetails(taskId: string, userId: string) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          group: {
            select: {
              id: true, name: true, description: true, currentRotationWeek: true,
              members: {
                where: { isActive: true },
                select: {
                  user: { select: { id: true, fullName: true, avatarUrl: true } },
                  groupRole: true, rotationOrder: true, isActive: true
                },
                orderBy: { rotationOrder: 'asc' }
              }
            }
          },
          creator: { select: { id: true, fullName: true, avatarUrl: true } },
          assignments: {
            include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
            orderBy: { rotationWeek: 'desc' },
            take: 10
          }
        }
      });

      if (!task) {
        return { success: false, message: "Task not found" };
      }

      const isMember = await prisma.groupMember.findFirst({
        where: { userId, groupId: task.groupId }
      });

      if (!isMember) {
        return { success: false, message: "You are not a member of this group" };
      }

      const userAssignment = task.assignments.find(a => 
        a.userId === userId && a.rotationWeek === task.group.currentRotationWeek
      );

      const settings = task as any;

      return {
        success: true,
        message: "Task details retrieved",
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          points: task.points,
          executionFrequency: task.executionFrequency,
          scheduledTime: task.scheduledTime,
          timeFormat: task.timeFormat,
          selectedDays: this.safeJsonParse<DayOfWeek>(task.selectedDays),
          dayOfWeek: task.dayOfWeek,
          isRecurring: task.isRecurring,
          category: task.category,
          rotationOrder: task.rotationOrder,
          currentAssignee: task.currentAssignee,
          lastAssignedAt: task.lastAssignedAt,
          createdAt: task.createdAt,
          group: task.group,
          creator: task.creator,
          assignments: task.assignments,
          userAssignment: userAssignment || null,
          totalAssignments: task.assignments.length,
          rotationMembers: this.safeJsonParse<any>(settings.rotationMembers)
        }
      };

    } catch (error: any) {
      console.error("TaskService.getTaskDetails error:", error);
      return { success: false, message: error.message || "Error retrieving task details" };
    }
  }

  // Delete a task
  static async deleteTask(taskId: string, userId: string) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { group: true }
      });

      if (!task) {
        return { success: false, message: "Task not found" };
      }

      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId: task.groupId, groupRole: "ADMIN" }
      });

      if (!membership) {
        return { success: false, message: "Only group admins can delete tasks" };
      }

      await prisma.task.delete({ where: { id: taskId } });

      return { success: true, message: "Task deleted successfully" };

    } catch (error: any) {
      console.error("TaskService.deleteTask error:", error);
      return { success: false, message: error.message || "Error deleting task" };
    }
  }

  // Update task
  static async updateTask(userId: string, taskId: string, data: any) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { group: true }
      });

      if (!task) {
        return { success: false, message: "Task not found" };
      }

      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId: task.groupId, groupRole: "ADMIN" }
      });

      if (!membership) {
        return { success: false, message: "Only group admins can update tasks" };
      }

      const updateData: any = {};
      
      if (data.title !== undefined) updateData.title = data.title.trim();
      if (data.description !== undefined) updateData.description = data.description?.trim() || null;
      if (data.points !== undefined) updateData.points = data.points;
      if (data.executionFrequency !== undefined) updateData.executionFrequency = data.executionFrequency;
      if (data.scheduledTime !== undefined) updateData.scheduledTime = data.scheduledTime || null;
      if (data.timeFormat !== undefined) updateData.timeFormat = data.timeFormat || '12h';
      if (data.selectedDays !== undefined) {
        updateData.selectedDays = data.selectedDays?.length > 0 ? data.selectedDays : null;
      }
      if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
      if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
      if (data.category !== undefined) updateData.category = data.category?.trim() || null;
      if (data.rotationOrder !== undefined) updateData.rotationOrder = data.rotationOrder;

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: updateData,
        include: {
          group: { select: { id: true, name: true } },
          creator: { select: { id: true, fullName: true, avatarUrl: true } }
        }
      });

      return {
        success: true,
        message: "Task updated successfully",
        task: updatedTask
      };

    } catch (error: any) {
      console.error("TaskService.updateTask error:", error);
      return { success: false, message: error.message || "Error updating task" };
    }
  }

  // Rotate tasks
  static async rotateGroupTasks(groupId: string, userId: string) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId, groupRole: "ADMIN" }
      });

      if (!membership) {
        return { success: false, message: "Only group admins can rotate tasks" };
      }

      const group = await prisma.group.findUnique({ where: { id: groupId } });
      if (!group) {
        return { success: false, message: "Group not found" };
      }

      const tasks = await prisma.task.findMany({
        where: { groupId, isRecurring: true },
        orderBy: { rotationOrder: 'asc' }
      });

      if (tasks.length === 0) {
        return { success: false, message: "No recurring tasks to rotate" };
      }

      const newWeek = group.currentRotationWeek + 1;
      const { weekStart, weekEnd } = this.getWeekBoundaries(1);
      const rotatedTasks = [];

      for (const task of tasks) {
        const settings = task as any;
        const rotationMembers = this.safeJsonParse<any>(settings.rotationMembers);
        
        if (rotationMembers.length === 0) continue;

        const currentIndex = rotationMembers.findIndex((m: any) => m.userId === task.currentAssignee);
        if (currentIndex === -1) continue;

        const nextIndex = (currentIndex + 1) % rotationMembers.length;
        const nextAssignee = rotationMembers[nextIndex];

        if (!nextAssignee) continue;

        await prisma.task.update({
          where: { id: task.id },
          data: { currentAssignee: nextAssignee.userId, lastAssignedAt: new Date() }
        });

        await prisma.assignment.deleteMany({
          where: { taskId: task.id, rotationWeek: newWeek }
        });

        if (task.executionFrequency === 'DAILY' && task.scheduledTime) {
          for (let i = 0; i < 7; i++) {
            const dueDate = new Date(weekStart);
            dueDate.setDate(dueDate.getDate() + i);
            const timeParts = task.scheduledTime.split(':');
            const hours = Number(timeParts[0]) || 18;
            const minutes = Number(timeParts[1]) || 0;
            dueDate.setHours(hours, minutes, 0, 0);
            
            await prisma.assignment.create({
              data: {
                taskId: task.id,
                userId: nextAssignee.userId,
                dueDate,
                rotationWeek: newWeek,
                weekStart,
                weekEnd,
                assignmentDay: this.getDayOfWeekFromIndex(i),
                completed: false
              }
            });
          }
        } else if (task.executionFrequency === 'WEEKLY') {
          const selectedDays = this.safeJsonParse<DayOfWeek>(task.selectedDays) || 
                               (task.dayOfWeek ? [task.dayOfWeek] : ['MONDAY']);
          
          for (const day of selectedDays) {
            const dueDate = this.calculateDueDate(day, task.scheduledTime || undefined);
            dueDate.setDate(dueDate.getDate() + 7);
            
            await prisma.assignment.create({
              data: {
                taskId: task.id,
                userId: nextAssignee.userId,
                dueDate,
                rotationWeek: newWeek,
                weekStart,
                weekEnd,
                assignmentDay: day,
                completed: false
              }
            });
          }
        }

        rotatedTasks.push({
          taskId: task.id,
          taskTitle: task.title,
          previousAssignee: task.currentAssignee,
          newAssignee: nextAssignee.userId,
          newAssigneeName: nextAssignee.fullName
        });
      }

      await prisma.group.update({
        where: { id: groupId },
        data: { currentRotationWeek: newWeek, lastRotationUpdate: new Date() }
      });

      return {
        success: true,
        message: `Rotated ${rotatedTasks.length} tasks to week ${newWeek}`,
        rotatedTasks,
        newWeek,
        weekStart,
        weekEnd
      };

    } catch (error: any) {
      console.error("TaskService.rotateGroupTasks error:", error);
      return { success: false, message: error.message || "Error rotating tasks" };
    }
  }

  // Get rotation schedule
  static async getRotationSchedule(groupId: string, userId: string, weeks: number = 4) {
    try {
      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId }
      });

      if (!membership) {
        return { success: false, message: "You are not a member in this group" };
      }

      const group = await prisma.group.findUnique({ where: { id: groupId } });
      if (!group) {
        return { success: false, message: "Group not found" };
      }

      const tasks = await prisma.task.findMany({
        where: { groupId, isRecurring: true },
        orderBy: { rotationOrder: 'asc' }
      });

      const schedule = [];

      for (let weekOffset = 0; weekOffset < weeks; weekOffset++) {
        const weekNumber = group.currentRotationWeek + weekOffset;
        const { weekStart, weekEnd } = this.getWeekBoundaries(weekOffset);

        const weekSchedule: any = {
          week: weekNumber,
          weekStart,
          weekEnd,
          tasks: []
        };

        for (const task of tasks) {
          const settings = task as any;
          const rotationMembers = this.safeJsonParse<any>(settings.rotationMembers);
          
          if (rotationMembers.length === 0) continue;

          const rotationOrderValue = task.rotationOrder !== null && task.rotationOrder !== undefined 
            ? Number(task.rotationOrder) 
            : 1;
          const taskRotationOrder = Math.max(1, rotationOrderValue);
          const taskIndex = Math.max(0, taskRotationOrder - 1);
          const assigneeIndex = (taskIndex + weekOffset) % rotationMembers.length;
          const assignee = rotationMembers[assigneeIndex];

          weekSchedule.tasks.push({
            taskId: task.id,
            taskTitle: task.title,
            executionFrequency: task.executionFrequency,
            scheduledTime: task.scheduledTime || undefined,
            selectedDays: this.safeJsonParse<DayOfWeek>(task.selectedDays) || 
                         (task.dayOfWeek ? [task.dayOfWeek] : []),
            assignee: assignee ? {
              id: assignee.userId,
              name: assignee.fullName,
              avatarUrl: assignee.avatarUrl
            } : null,
            points: task.points
          });
        }

        schedule.push(weekSchedule);
      }

      return {
        success: true,
        message: "Rotation schedule retrieved",
        schedule,
        currentWeek: group.currentRotationWeek,
        totalTasks: tasks.length
      };

    } catch (error: any) {
      console.error("TaskService.getRotationSchedule error:", error);
      return { success: false, message: error.message || "Error retrieving rotation schedule" };
    }
  }
}