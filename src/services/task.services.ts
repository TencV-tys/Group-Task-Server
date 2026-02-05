// services/task.services.ts
import prisma from "../prisma";
import { DayOfWeek, TaskExecutionFrequency, Prisma } from '@prisma/client';

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
  static calculateDueDate(day: DayOfWeek, scheduledTime?: string | null): Date {
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

  // Update the createTask method in TaskService
static async createTask(
  userId: string,
  groupId: string,
  data: {
    title: string;
    description?: string;
    points?: number;
    category?: string;
    executionFrequency: TaskExecutionFrequency;
    timeFormat?: string;
    selectedDays?: DayOfWeek[];
    dayOfWeek?: DayOfWeek;
    isRecurring?: boolean;
    rotationMemberIds?: string[];
    rotationOrder?: number;
    timeSlots?: Array<{ startTime: string; endTime: string; label?: string }>;
    // Add a parameter to specify initial assignee
    initialAssigneeId?: string;
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

    // Validate time slots if provided
    if (data.timeSlots && data.timeSlots.length > 0) {
      for (const slot of data.timeSlots) {
        if (!slot.startTime || !slot.endTime) {
          return { success: false, message: "Time slots must have both start and end times" };
        }
        // Validate time format
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
          return { success: false, message: "Invalid time format. Use HH:MM" };
        }
      }
    }

    if (data.executionFrequency === 'DAILY' && 
        (!data.timeSlots || data.timeSlots.length === 0)) {
      return { success: false, message: "Daily tasks require time slots" };
    }

    if (data.executionFrequency === 'WEEKLY' && 
        !data.selectedDays?.length && 
        !data.dayOfWeek) {
      return { success: false, message: "Weekly tasks require at least one day selection" };
    }

    // Fix the problematic section
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
  // Get all active members in the group
  rotationMembers = await prisma.groupMember.findMany({
    where: { groupId, isActive: true },
    include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
    orderBy: { rotationOrder: 'asc' }
  });
}

if (rotationMembers.length === 0) {
  return { success: false, message: "No active members available for rotation" };
}

// Determine initial assignee
let initialAssignee;
if (data.initialAssigneeId) {
  // Use the specified initial assignee
  initialAssignee = rotationMembers.find(m => m.userId === data.initialAssigneeId);
  if (!initialAssignee) {
    return { success: false, message: "Specified initial assignee is not in the rotation" };
  }
} else if (targetMemberIds.length > 0) { 
  initialAssignee = rotationMembers.find(m => m.userId === targetMemberIds[0]);
} else {
  // Use the first member in rotation order as default
  initialAssignee = rotationMembers[0];
}

    if (!initialAssignee) {
      return { success: false, message: "Could not determine initial assignee" };
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

    let selectedDaysArray: DayOfWeek[] = [];
    if (data.executionFrequency === 'WEEKLY') {
      if (data.selectedDays && data.selectedDays.length > 0) {
        selectedDaysArray = data.selectedDays;
      } else if (data.dayOfWeek) {
        selectedDaysArray = [data.dayOfWeek];
      }
    }

    // Create the task
    const taskData: Prisma.TaskCreateInput = {
      title: data.title.trim(),
      description: data.description?.trim() || undefined,
      points: pointsValue,
      executionFrequency: data.executionFrequency,
      timeFormat: data.timeFormat || '12h',
      dayOfWeek: data.dayOfWeek || undefined,
      isRecurring: data.isRecurring !== false,
      category: data.category?.trim() || undefined,
      rotationOrder: safeOrder,
      currentAssignee: initialAssignee.userId, // Use the determined initial assignee
      lastAssignedAt: new Date(),
      rotationMembers: rotationMembers.map(member => ({
        userId: member.userId,
        fullName: member.user.fullName,
        avatarUrl: member.user.avatarUrl,
        rotationOrder: member.rotationOrder,
        groupRole: member.groupRole
      })) as any, // Use any type for JSON field
      group: { connect: { id: groupId } },
      creator: { connect: { id: userId } },
      selectedDays: selectedDaysArray.length > 0 ? selectedDaysArray : undefined
    };

    const task = await prisma.task.create({
      data: taskData
    });

    let createdSlots: any[] = [];
    
    // Create time slots if provided
    if (data.timeSlots && data.timeSlots.length > 0) {
      const timeSlotPromises = data.timeSlots.map((slot, index) => 
        prisma.timeSlot.create({
          data: {
            taskId: task.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            label: slot.label || undefined,
            sortOrder: index,
            isPrimary: index === 0 // First slot is primary
          }
        })
      );

      createdSlots = await Promise.all(timeSlotPromises);
      
      // Update task with primary time slot
      if (createdSlots.length > 0) {
        await prisma.task.update({
          where: { id: task.id },
          data: { primaryTimeSlotId: createdSlots[0].id }
        });
      }
    } else {
      // Create a default time slot
      const defaultSlot = await prisma.timeSlot.create({
        data: {
          taskId: task.id,
          startTime: "18:00",
          endTime: "19:00",
          label: "Default",
          sortOrder: 0,
          isPrimary: true
        }
      });
      createdSlots = [defaultSlot];
      await prisma.task.update({
        where: { id: task.id },
        data: { primaryTimeSlotId: defaultSlot.id }
      });
    }

    const { weekStart, weekEnd } = this.getWeekBoundaries();
    
    // Create assignments based on frequency and time slots
    if (data.executionFrequency === 'DAILY') {
      // For daily tasks, create assignments for each day of the week
      const timeSlotsToUse = data.timeSlots || [{ startTime: "18:00", endTime: "19:00" }];
      
      for (let i = 0; i < 7; i++) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + i);
        
        // Create assignment for each time slot
        for (const timeSlot of timeSlotsToUse) {
          const timeParts = timeSlot.startTime.split(':');
          const hours = Number(timeParts[0]) || 18;
          const minutes = Number(timeParts[1]) || 0;
          
          const slotDueDate = new Date(dueDate);
          slotDueDate.setHours(hours, minutes, 0, 0);
          
          // Find the time slot in database
          const dbTimeSlot = createdSlots?.find(s => 
            s.startTime === timeSlot.startTime && 
            s.endTime === timeSlot.endTime
          );
          
          await prisma.assignment.create({
            data: {
              taskId: task.id,
              userId: initialAssignee.userId, // Assign to the initial assignee
              dueDate: slotDueDate,
              rotationWeek: group.currentRotationWeek,
              weekStart,
              weekEnd,
              assignmentDay: this.getDayOfWeekFromIndex(i),
              completed: false,
              timeSlotId: dbTimeSlot?.id
            }
          });
        }
      }
    } else if (data.executionFrequency === 'WEEKLY') {
      // For weekly tasks, create assignments for selected days
      const timeSlotsToUse = data.timeSlots || [{ startTime: "18:00", endTime: "19:00" }];
      
      for (const day of selectedDaysArray) {
        const baseDueDate = this.calculateDueDate(day, undefined);
        
        // Create assignment for each time slot
        for (const timeSlot of timeSlotsToUse) {
          const timeParts = timeSlot.startTime.split(':');
          const hours = Number(timeParts[0]) || 18;
          const minutes = Number(timeParts[1]) || 0;
          
          const slotDueDate = new Date(baseDueDate);
          slotDueDate.setHours(hours, minutes, 0, 0);
          
          // Find the time slot in database
          const dbTimeSlot = createdSlots?.find(s => 
            s.startTime === timeSlot.startTime && 
            s.endTime === timeSlot.endTime
          );
          
          await prisma.assignment.create({
            data: {
              taskId: task.id,
              userId: initialAssignee.userId, // Assign to the initial assignee
              dueDate: slotDueDate,
              rotationWeek: group.currentRotationWeek,
              weekStart,
              weekEnd,
              assignmentDay: day,
              completed: false,
              timeSlotId: dbTimeSlot?.id
            }
          });
        }
      }
    }

    // Fetch complete task with relations
    const completeTask = await prisma.task.findUnique({
      where: { id: task.id },
      include: {
        group: { select: { id: true, name: true, description: true } },
        creator: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
        timeSlots: { orderBy: { sortOrder: 'asc' } },
        assignments: {
          where: { rotationWeek: group.currentRotationWeek },
          include: { 
            user: { select: { id: true, fullName: true, avatarUrl: true } },
            timeSlot: true 
          },
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

  // Get group tasks (updated to include time slots)
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
          timeSlots: { 
            orderBy: { sortOrder: 'asc' },
            select: { id: true, startTime: true, endTime: true, label: true, isPrimary: true }
          },
          assignments: {
            where: { rotationWeek: targetWeek },
            include: { 
              user: { select: { id: true, fullName: true, avatarUrl: true } },
              timeSlot: { select: { id: true, startTime: true, endTime: true, label: true } }
            },
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
          timeFormat: task.timeFormat,
          timeSlots: task.timeSlots || [],
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

  // Get user's tasks (updated to include time slots)
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
            include: { 
              creator: { select: { id: true, fullName: true, avatarUrl: true } },
              timeSlots: { 
                orderBy: { sortOrder: 'asc' },
                select: { id: true, startTime: true, endTime: true, label: true }
              }
            }
          },
          timeSlot: { select: { id: true, startTime: true, endTime: true, label: true } }
        },
        orderBy: { dueDate: 'asc' }
      });

      const tasks = assignments.map(assignment => ({
        id: assignment.task.id,
        title: assignment.task.title,
        description: assignment.task.description,
        points: assignment.task.points,
        executionFrequency: assignment.task.executionFrequency,
        timeFormat: assignment.task.timeFormat,
        timeSlots: assignment.task.timeSlots || [],
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
          rotationWeek: assignment.rotationWeek,
          timeSlot: assignment.timeSlot
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

  // Get task details (updated to include time slots)
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
          timeSlots: { 
            orderBy: { sortOrder: 'asc' },
            select: { id: true, startTime: true, endTime: true, label: true, isPrimary: true }
          },
          assignments: {
            include: { 
              user: { select: { id: true, fullName: true, avatarUrl: true } },
              timeSlot: { select: { id: true, startTime: true, endTime: true, label: true } }
            },
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
          timeFormat: task.timeFormat,
          timeSlots: task.timeSlots || [],
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

  // Update task (with time slots support)
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

      const updateData: Prisma.TaskUpdateInput = {};
      
      if (data.title !== undefined) updateData.title = data.title.trim();
      if (data.description !== undefined) updateData.description = data.description?.trim() || undefined;
      if (data.points !== undefined) updateData.points = data.points;
      if (data.executionFrequency !== undefined) updateData.executionFrequency = data.executionFrequency;
      if (data.timeFormat !== undefined) updateData.timeFormat = data.timeFormat || '12h';
      if (data.selectedDays !== undefined) {
        updateData.selectedDays = data.selectedDays?.length > 0 ? data.selectedDays : undefined;
      }
      if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
      if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
      if (data.category !== undefined) updateData.category = data.category?.trim() || undefined;
      if (data.rotationOrder !== undefined) updateData.rotationOrder = data.rotationOrder;

      // Handle time slots update
      if (data.timeSlots !== undefined) {
        // First, delete existing time slots
        await prisma.timeSlot.deleteMany({
          where: { taskId }
        });

        // Create new time slots
        if (data.timeSlots.length > 0) {
          const timeSlotPromises = data.timeSlots.map((slot: any, index: number) => 
            prisma.timeSlot.create({
              data: {
                taskId,
                startTime: slot.startTime,
                endTime: slot.endTime,
                label: slot.label || undefined,
                sortOrder: index,
                isPrimary: index === 0
              }
            })
          );

          const createdSlots = await Promise.all(timeSlotPromises);
          
          // Update task with primary time slot
          if (createdSlots.length > 0) {
            updateData.primaryTimeSlot = { connect: { id: createdSlots[0].id } };
          }
        }
      }

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: updateData,
        include: {
          group: { select: { id: true, name: true } },
          creator: { select: { id: true, fullName: true, avatarUrl: true } },
          timeSlots: { orderBy: { sortOrder: 'asc' } }
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

  // Rotate tasks (updated to handle time slots)
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
        include: {
          timeSlots: { orderBy: { sortOrder: 'asc' } }
        },
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

        // Get time slots for this task
        const timeSlots = task.timeSlots || [{ startTime: "18:00", endTime: "19:00", id: undefined }];

        if (task.executionFrequency === 'DAILY') {
          for (let i = 0; i < 7; i++) {
            const dueDate = new Date(weekStart);
            dueDate.setDate(dueDate.getDate() + i);
            
            // Create assignment for each time slot
            for (const timeSlot of timeSlots) {
              const timeParts = timeSlot.startTime.split(':');
              const hours = Number(timeParts[0]) || 18;
              const minutes = Number(timeParts[1]) || 0;
              
              const slotDueDate = new Date(dueDate);
              slotDueDate.setHours(hours, minutes, 0, 0);
              
              await prisma.assignment.create({
                data: {
                  taskId: task.id,
                  userId: nextAssignee.userId,
                  dueDate: slotDueDate,
                  rotationWeek: newWeek,
                  weekStart,
                  weekEnd,
                  assignmentDay: this.getDayOfWeekFromIndex(i),
                  completed: false,
                  timeSlotId: timeSlot.id
                }
              });
            }
          }
        } else if (task.executionFrequency === 'WEEKLY') {
          const selectedDays = this.safeJsonParse<DayOfWeek>(task.selectedDays) || 
                               (task.dayOfWeek ? [task.dayOfWeek] : ['MONDAY']);
          
          for (const day of selectedDays) {
            const baseDueDate = this.calculateDueDate(day, undefined);
            baseDueDate.setDate(baseDueDate.getDate() + 7);
            
            // Create assignment for each time slot
            for (const timeSlot of timeSlots) {
              const timeParts = timeSlot.startTime.split(':');
              const hours = Number(timeParts[0]) || 18;
              const minutes = Number(timeParts[1]) || 0;
              
              const slotDueDate = new Date(baseDueDate);
              slotDueDate.setHours(hours, minutes, 0, 0);
              
              await prisma.assignment.create({
                data: {
                  taskId: task.id,
                  userId: nextAssignee.userId,
                  dueDate: slotDueDate,
                  rotationWeek: newWeek,
                  weekStart,
                  weekEnd,
                  assignmentDay: day,
                  completed: false,
                  timeSlotId: timeSlot.id
                }
              });
            }
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

  // Get rotation schedule (updated)
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
        include: {
          timeSlots: { 
            orderBy: { sortOrder: 'asc' },
            select: { id: true, startTime: true, endTime: true, label: true }
          }
        },
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
            timeSlots: task.timeSlots || [],
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