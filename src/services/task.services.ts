// services/task.services.ts
import prisma from "../prisma";
import { TaskExecutionFrequency, Prisma,DayOfWeek } from '@prisma/client';
import { TaskHelpers } from "../helpers/task.helpers";
import { TimeHelpers } from "../helpers/time.helpers";
import { SocketService } from "./socket.services";
import { RotationHelpers } from "../helpers/rotation.helpers";
export class TaskService {
  
  // Create task with distributed points across time slots
  static async createTask(
    userId: string,
    groupId: string,
    data: { 
      title: string;
      description?: string;
      points?: number; // TOTAL task points to be distributed
      category?: string;
      executionFrequency: TaskExecutionFrequency;
      timeFormat?: string;
      selectedDays?: any[];
      dayOfWeek?: any;
      isRecurring?: boolean;
      rotationMemberIds?: string[];
      rotationOrder?: number;
      timeSlots?: Array<{
        startTime: string;
        endTime: string;
        label?: string;
        points?: string | number; // Points for THIS specific time slot
      }>;
      initialAssigneeId?: string;
    }
  ) {
    try {
      // Validate user membership and permissions
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

      // Validate required fields
      if (!data.title?.trim()) {
        return { success: false, message: "Task title is required" };
      }

      // Total task points (to be distributed)
      const totalPoints = data.points !== undefined ? Math.max(1, Number(data.points)) : 1;

      // Validate execution frequency requirements
      if (data.executionFrequency === 'DAILY' && (!data.timeSlots || data.timeSlots.length === 0)) {
        return { success: false, message: "Daily tasks require time slots" };
      }

      if (data.executionFrequency === 'WEEKLY' && !data.selectedDays?.length && !data.dayOfWeek) {
        return { success: false, message: "Weekly tasks require at least one day selection" };
      }

      // Validate time slot points distribution
      const timeSlotsValidation = TaskHelpers.validateAndCalculateTimeSlotPoints(
        data.timeSlots || [],
        totalPoints
      );
      
      if (!timeSlotsValidation.isValid) {
        return { success: false, message: timeSlotsValidation.error };
      }
             const analysis = await RotationHelpers.analyzeGroupRotation(groupId);
    
    // If this is a recurring task and we don't have enough tasks for all members
    if (data.isRecurring && !analysis.hasEnoughTasks) {
      const tasksNeeded = analysis.tasksNeeded;
      const memberCount = analysis.totalMembers;
      const currentTasks = analysis.totalTasks;
      
      // If this will be the task that completes the set, allow it with warning
      if (currentTasks + 1 === memberCount) {
        // Perfect - this task will complete the set
        console.log(`✅ This task will complete the rotation set (${memberCount}/${memberCount})`);
      } else {
        // Still need more tasks
        return {
          success: false,
          message: `Cannot create task yet. You have ${memberCount} members but only ${currentTasks} recurring tasks. You need ${tasksNeeded} more task(s) for perfect rotation. Each member should have one task.`,
          warning: true,
          analysis
        };
      }
    }
      // Get rotation members
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
        // Get all active members for rotation
        rotationMembers = await prisma.groupMember.findMany({
          where: { groupId, isActive: true },
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          orderBy: { rotationOrder: 'asc' }
        });
      }

      if (rotationMembers.length === 0) {
        return { success: false, message: "No active members available for rotation" };
      }

      // Determine initial assignee if specified
      let initialAssignee = null;
      if (data.initialAssigneeId) {
        initialAssignee = rotationMembers.find(m => m.userId === data.initialAssigneeId);
        if (!initialAssignee) {
          return { success: false, message: "Specified initial assignee is not in the rotation" };
        }
      }

      // Determine rotation order
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

      // Prepare selected days array for weekly tasks
      let selectedDaysArray = TaskHelpers.validateSelectedDays(data.selectedDays);
      if (data.executionFrequency === 'WEEKLY' && !selectedDaysArray && data.dayOfWeek) {
        selectedDaysArray = TaskHelpers.validateSelectedDays([data.dayOfWeek]);
      }

      // Prepare rotation members JSON
      const rotationMembersJson = rotationMembers.map(member => ({
        userId: member.userId,
        fullName: member.user.fullName,
        avatarUrl: member.user.avatarUrl,
        rotationOrder: member.rotationOrder,
        groupRole: member.groupRole
      }));

      // Create the task
      const taskData: Prisma.TaskCreateInput = {
        title: data.title.trim(),
        description: data.description?.trim() || undefined,
        points: totalPoints, // Store total points for reference
        executionFrequency: data.executionFrequency,
        timeFormat: data.timeFormat || '12h',
        dayOfWeek: data.dayOfWeek || undefined,
        isRecurring: data.isRecurring !== false,
        category: data.category?.trim() || undefined,
        rotationOrder: finalRotationOrder,
        rotationMembers: rotationMembersJson as any,
        selectedDays: selectedDaysArray ? selectedDaysArray as any : undefined,
        // Only set currentAssignee if initialAssignee exists
        ...(initialAssignee ? {
          currentAssignee: initialAssignee.userId,
          lastAssignedAt: new Date()
        } : {}),
        group: { connect: { id: groupId } },
        creator: { connect: { id: userId } }
      };

      const task = await prisma.task.create({
        data: taskData
      });

      // Create time slots with calculated points
      let createdSlots: any[] = [];
      if (timeSlotsValidation.calculatedSlots && timeSlotsValidation.calculatedSlots.length > 0) {
        const timeSlotPromises = timeSlotsValidation.calculatedSlots.map((slot, index) => 
          prisma.timeSlot.create({
            data: {
              taskId: task.id,
              startTime: slot.startTime,
              endTime: slot.endTime,
              label: slot.label || TaskHelpers.getTimeSlotLabel(slot.startTime),
              points: slot.points, // Store individual time slot points
              sortOrder: index,
              isPrimary: index === 0
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
        // Create default time slot with all points
        const defaultSlot = await prisma.timeSlot.create({
          data: {
            taskId: task.id,
            startTime: "18:00",
            endTime: "19:00",
            label: "Default",
            points: totalPoints, // All points go to this slot
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

      // Create assignments if there's an initial assignee
      if (initialAssignee) {
        const { weekStart, weekEnd } = TaskHelpers.getWeekBoundaries();
        
        if (data.executionFrequency === 'DAILY') {
          // Daily tasks: create assignments for each day of the week with each time slot
          for (let i = 0; i < 7; i++) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + i);
            
            for (const timeSlot of createdSlots) {
              const timeParts = timeSlot.startTime.split(':');
              const hours = Number(timeParts[0]) || 18;
              const minutes = Number(timeParts[1]) || 0;
              
              const slotDueDate = new Date(dueDate);
              slotDueDate.setHours(hours, minutes, 0, 0);
              
              // Use time slot points (already calculated and stored)
              const assignmentPoints = timeSlot.points !== null ? timeSlot.points : 0;

              await prisma.assignment.create({
                data: {
                  taskId: task.id,
                  userId: initialAssignee.userId,
                  dueDate: slotDueDate,
                  points: assignmentPoints,
                  rotationWeek: group.currentRotationWeek,
                  weekStart,
                  weekEnd,
                  assignmentDay: TaskHelpers.getDayOfWeekFromIndex(i),
                  completed: false,
                  timeSlotId: timeSlot.id
                }
              });
            }
          }
        } else if (data.executionFrequency === 'WEEKLY') {
          // Weekly tasks: create assignments for selected days with each time slot
          if (selectedDaysArray) {
            for (const day of selectedDaysArray) {
              const baseDueDate = TaskHelpers.calculateDueDate(day, undefined);
              
              for (const timeSlot of createdSlots) {
                const timeParts = timeSlot.startTime.split(':');
                const hours = Number(timeParts[0]) || 18;
                const minutes = Number(timeParts[1]) || 0;
                
                const slotDueDate = new Date(baseDueDate);
                slotDueDate.setHours(hours, minutes, 0, 0);
                
                // Use time slot points (already calculated and stored)
                const assignmentPoints = timeSlot.points !== null ? timeSlot.points : 0;

                await prisma.assignment.create({
                  data: {
                    taskId: task.id,
                    userId: initialAssignee.userId,
                    dueDate: slotDueDate,
                    points: assignmentPoints,
                    rotationWeek: group.currentRotationWeek,
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
        }
      }


    // Fetch complete task with relations
const completeTask = await prisma.task.findUnique({
  where: { id: task.id },
  include: {
    group: { select: { id: true, name: true, description: true, currentRotationWeek: true } },
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

// 🔴 EMIT SOCKET EVENT FOR TASK CREATED
await SocketService.emitTaskCreated(completeTask, groupId, userId);

// If assigned to someone, emit assignment created event
if (initialAssignee) {
  await SocketService.emitAssignmentCreated(
    completeTask?.assignments?.[0],
    initialAssignee.userId,
    groupId
  );
}

return {
  success: true,
  message: initialAssignee ? "Task created and assigned successfully" : "Task created successfully (not assigned)",
  task: completeTask
};

    } catch (error: any) {
      console.error('TaskService.createTask error:', error);
      return { success: false, message: error.message || "Error creating task" };
    }
  }

  // Get group tasks with time slots
 // In task.services.ts - Update getGroupTasks method
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
    const { weekStart, weekEnd } = TaskHelpers.getWeekBoundaries(weekOffset);

    // ADD THIS: Get today's date info
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tasks = await prisma.task.findMany({
      where: { groupId, isDeleted:false },
      include: {
        creator: { select: { id: true, fullName: true, avatarUrl: true } },
        timeSlots: { 
          orderBy: { sortOrder: 'asc' },
          select: { 
            id: true, 
            startTime: true, 
            endTime: true, 
            label: true, 
            isPrimary: true,
            points: true 
          }
        },
        assignments: {
          where: { rotationWeek: targetWeek },
          include: { 
            user: { select: { id: true, fullName: true, avatarUrl: true } },
            timeSlot: { 
              select: { 
                id: true, 
                startTime: true, 
                endTime: true, 
                label: true,
                points: true 
              }
            }
          },
          orderBy: { dueDate: 'asc' }
        }
      },
      orderBy: [{ rotationOrder: 'asc' }, { createdAt: 'desc' }]
    });

    const formattedTasks = tasks.map(task => {
      const rotationMembers = TaskHelpers.safeJsonParse<any>(task.rotationMembers as any);
      const userAssignment = task.assignments.find(a => a.userId === userId);
      
      // ADD THIS: Add isDueToday to assignments
      const assignmentsWithDueInfo = task.assignments.map(assignment => ({
        ...assignment,
        isDueToday: assignment.dueDate >= today && assignment.dueDate < tomorrow
      }));
      
      return {
        id: task.id,
        title: task.title,
        description: task.description,
        points: task.points,
        executionFrequency: task.executionFrequency,
        timeFormat: task.timeFormat,
        timeSlots: task.timeSlots || [],
        selectedDays: TaskHelpers.safeJsonParse(task.selectedDays),
        dayOfWeek: task.dayOfWeek,
        isRecurring: task.isRecurring,
        category: task.category,
        rotationOrder: task.rotationOrder,
        currentAssignee: task.currentAssignee,
        lastAssignedAt: task.lastAssignedAt,
        createdAt: task.createdAt,
        creator: task.creator,
        assignments: assignmentsWithDueInfo, // Updated assignments
        userAssignment: userAssignment || null,
        isAssignedToUser: !!userAssignment,
        rotationMembers: rotationMembers,
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
      weekEnd,
      // ADD THIS: Current date info
      currentDate: {
        today,
        tomorrow
      }
    };

  } catch (error: any) {
    console.error("TaskService.getGroupTasks error:", error);
    return { success: false, message: error.message || "Error retrieving tasks" };
  }
}
  // In task.services.ts - Update getUserTasks method
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
    const { weekStart, weekEnd } = TaskHelpers.getWeekBoundaries(weekOffset);

    // ADD THIS: Get today's date info
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const assignments = await prisma.assignment.findMany({
      where: { userId, task: { groupId }, rotationWeek: targetWeek },
      include: {
        task: {
          include: { 
            creator: { select: { id: true, fullName: true, avatarUrl: true } },
            timeSlots: { 
              orderBy: { sortOrder: 'asc' },
              select: { 
                id: true, 
                startTime: true, 
                endTime: true, 
                label: true,
                points: true 
              }
            }
          }
        },
        timeSlot: { 
          select: { 
            id: true, 
            startTime: true, 
            endTime: true, 
            label: true,
            points: true 
          }
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
      timeFormat: assignment.task.timeFormat,
      timeSlots: assignment.task.timeSlots || [],
      selectedDays: TaskHelpers.safeJsonParse(assignment.task.selectedDays),
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
        points: assignment.points,
        weekStart: assignment.weekStart,
        weekEnd: assignment.weekEnd,
        rotationWeek: assignment.rotationWeek,
        timeSlot: assignment.timeSlot,
        // ADD THIS: Is due today flag
        isDueToday: assignment.dueDate >= today && assignment.dueDate < tomorrow
      }
    }));

    return {
      success: true,
      message: "Your tasks retrieved successfully",
      tasks,
      currentWeek: group.currentRotationWeek,
      weekStart,
      weekEnd,
      // ADD THIS: Current date info
      currentDate: {
        today,
        tomorrow
      }
    };  

  } catch (error: any) {
    console.error("TaskService.getUserTasks error:", error);
    return { success: false, message: error.message || "Error retrieving your tasks" };
  }
}
   
// In task.services.ts - Update getTaskDetails method
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
              where: { isActive: true },
              select: {
                user: { select: { id: true, fullName: true, avatarUrl: true } },
                groupRole: true, 
                rotationOrder: true, 
                isActive: true
              },
              orderBy: { rotationOrder: 'asc' }
            }
          }
        },
        creator: { select: { id: true, fullName: true, avatarUrl: true } },
        timeSlots: { 
          orderBy: { sortOrder: 'asc' },
          select: { 
            id: true, 
            startTime: true, 
            endTime: true, 
            label: true, 
            isPrimary: true,
            points: true 
          }
        },
        assignments: {
          include: { 
            user: { select: { id: true, fullName: true, avatarUrl: true } },
            timeSlot: { 
              select: { 
                id: true, 
                startTime: true, 
                endTime: true, 
                label: true,
                points: true 
              }
            }
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

    const rotationMembers = TaskHelpers.safeJsonParse<any>(task.rotationMembers as any);

    // ADD THIS: Calculate today's date info
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Add isDueToday flag to each assignment
    const assignmentsWithDueInfo = task.assignments.map(assignment => ({
      ...assignment,
      isDueToday: assignment.dueDate >= today && assignment.dueDate < tomorrow
    }));

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
        selectedDays: TaskHelpers.safeJsonParse(task.selectedDays),
        dayOfWeek: task.dayOfWeek,
        isRecurring: task.isRecurring,
        category: task.category,
        rotationOrder: task.rotationOrder,
        currentAssignee: task.currentAssignee,
        lastAssignedAt: task.lastAssignedAt,
        createdAt: task.createdAt,
        group: task.group,
        creator: task.creator,
        assignments: assignmentsWithDueInfo, // Use updated assignments
        userAssignment: userAssignment || null,
        totalAssignments: task.assignments.length,
        rotationMembers: rotationMembers,
        // ADD THIS: Current date info
        currentDate: {
          today: today,
          tomorrow: tomorrow,
          currentWeek: task.group.currentRotationWeek
        }
      }
    };

  } catch (error: any) {
    console.error("TaskService.getTaskDetails error:", error);
    return { success: false, message: error.message || "Error retrieving task details" };
  }
}
  
// Update task with time slots points distribution
  static async updateTask(
    userId: string, 
    taskId: string, 
    data: {
      title?: string;
      description?: string;
      points?: number; // NEW total points to redistribute
      category?: string;
      executionFrequency?: TaskExecutionFrequency;
      timeFormat?: string;
      selectedDays?: any[];
      dayOfWeek?: DayOfWeek;
      isRecurring?: boolean;
      rotationMemberIds?: string[];
      rotationOrder?: number;
      timeSlots?: Array<{
        startTime: string;
        endTime: string;
        label?: string;
        points?: string | number; // Points for THIS specific time slot
      }>;
      initialAssigneeId?: string;
    }
  ) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { 
          group: true,
          timeSlots: { orderBy: { sortOrder: 'asc' } }
        }
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

      // Get total points for distribution
      const totalPoints = data.points !== undefined ? Math.max(1, Number(data.points)) : task.points;

      // Validate time slots if provided
      let validatedTimeSlots = data.timeSlots;
      if (data.timeSlots !== undefined) {
        const timeSlotsValidation = TaskHelpers.validateAndCalculateTimeSlotPoints(
          data.timeSlots,
          totalPoints
        );
        
        if (!timeSlotsValidation.isValid) {
          return { success: false, message: timeSlotsValidation.error || "Invalid time slot points distribution" };
        }

        validatedTimeSlots = timeSlotsValidation.calculatedSlots as any;
      }

      // Update rotation members if provided
      let rotationMembersJson = task.rotationMembers;
      if (data.rotationMemberIds) {
        const rotationMembers = await prisma.groupMember.findMany({
          where: { 
            groupId: task.groupId, 
            userId: { in: data.rotationMemberIds }, 
            isActive: true 
          },
          include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
          orderBy: { rotationOrder: 'asc' }
        });

        if (rotationMembers.length !== data.rotationMemberIds.length) {
          return { success: false, message: "Some selected members are not in this group or are inactive" };
        }

        rotationMembersJson = rotationMembers.map(member => ({
          userId: member.userId,
          fullName: member.user.fullName,
          avatarUrl: member.user.avatarUrl,
          rotationOrder: member.rotationOrder,
          groupRole: member.groupRole
        })) as Prisma.JsonArray;
      }

      // Prepare update data
      const updateData: Prisma.TaskUpdateInput = {};
      
      if (data.title !== undefined) updateData.title = data.title.trim();
      if (data.description !== undefined) updateData.description = data.description?.trim() || null;
      if (data.points !== undefined) updateData.points = totalPoints;
      if (data.executionFrequency !== undefined) updateData.executionFrequency = data.executionFrequency;
      if (data.timeFormat !== undefined) updateData.timeFormat = data.timeFormat;
      
      // Handle selected days - FIXED: Proper JSON handling
      if (data.selectedDays !== undefined || data.dayOfWeek !== undefined) {
        let selectedDaysArray: DayOfWeek[] | undefined = undefined;
        if (data.selectedDays !== undefined) {
          selectedDaysArray = TaskHelpers.validateSelectedDays(data.selectedDays);
        } else if (data.dayOfWeek !== undefined) {
          selectedDaysArray = TaskHelpers.validateSelectedDays([data.dayOfWeek]);
        }
        updateData.selectedDays = selectedDaysArray as Prisma.JsonArray;
      }
      
      // Handle dayOfWeek - FIXED: Use Prisma enum
      if (data.dayOfWeek !== undefined) {
        updateData.dayOfWeek = data.dayOfWeek as DayOfWeek | null;
      }
      
      if (data.isRecurring !== undefined) updateData.isRecurring = data.isRecurring;
      if (data.category !== undefined) updateData.category = data.category?.trim() || null;
      if (data.rotationOrder !== undefined) updateData.rotationOrder = data.rotationOrder;
      updateData.rotationMembers = rotationMembersJson as Prisma.JsonArray;

      // Handle time slots update
      if (validatedTimeSlots !== undefined) {
        // Delete existing time slots
        await prisma.timeSlot.deleteMany({
          where: { taskId }
        });

        // Create new time slots with calculated points
        let createdSlots: any[] = [];
        if (validatedTimeSlots.length > 0) {
          const timeSlotPromises = validatedTimeSlots.map((slot: any, index: number) => 
            prisma.timeSlot.create({
              data: {
                taskId,
                startTime: slot.startTime,
                endTime: slot.endTime,
                label: slot.label || TaskHelpers.getTimeSlotLabel(slot.startTime),
                points: slot.points, // Use calculated points
                sortOrder: index,
                isPrimary: index === 0
              }
            })
          );

          createdSlots = await Promise.all(timeSlotPromises);
          
          // Update primary time slot - FIXED: Use primaryTimeSlot relation
          if (createdSlots.length > 0 && createdSlots[0]) {
            updateData.primaryTimeSlot = { connect: { id: createdSlots[0].id } };
          }
        } else {
          // Create default time slot if none provided
          const defaultSlot = await prisma.timeSlot.create({
            data: {
              taskId,
              startTime: "18:00",
              endTime: "19:00",
              label: "Default",
              points: totalPoints, // All points to default slot
              sortOrder: 0,
              isPrimary: true
            }
          });
          createdSlots = [defaultSlot];
          updateData.primaryTimeSlot = { connect: { id: defaultSlot.id } };
        }
      }

      // Handle initial assignee if specified
      if (data.initialAssigneeId !== undefined) {
        const rotationMembers = TaskHelpers.safeJsonParse<any>(rotationMembersJson as any);
        const newAssignee = rotationMembers.find((m: any) => m.userId === data.initialAssigneeId);
        
        if (data.initialAssigneeId && !newAssignee) {
          return { success: false, message: "Specified assignee is not in the rotation" };
        }

        if (data.initialAssigneeId) {
          updateData.currentAssignee = data.initialAssigneeId;
          updateData.lastAssignedAt = new Date();
          
          // Update assignments for current week
          const { weekStart, weekEnd } = TaskHelpers.getWeekBoundaries();
          
          // Delete existing assignments for current week
          await prisma.assignment.deleteMany({
            where: { 
              taskId, 
              rotationWeek: task.group.currentRotationWeek 
            }
          });

          // Get time slots (existing or newly created)
          let timeSlots: any[];
          if (validatedTimeSlots !== undefined) {
            timeSlots = validatedTimeSlots;
          } else {
            timeSlots = await prisma.timeSlot.findMany({
              where: { taskId },
              orderBy: { sortOrder: 'asc' }
            });
          }

          // Get selected days - FIXED: Handle undefined case
          const selectedDays = data.selectedDays ? 
            TaskHelpers.validateSelectedDays(data.selectedDays) : 
            TaskHelpers.safeJsonParse<DayOfWeek>(task.selectedDays as any) || 
            (task.dayOfWeek ? [task.dayOfWeek] : []);

          // Create new assignments based on task frequency
          if (task.executionFrequency === 'DAILY') {
            for (let i = 0; i < 7; i++) {
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + i);
              
              for (const timeSlot of timeSlots) {
                const timeParts = timeSlot.startTime.split(':');
                const hours = Number(timeParts[0]) || 18;
                const minutes = Number(timeParts[1]) || 0;
                
                const slotDueDate = new Date(dueDate);
                slotDueDate.setHours(hours, minutes, 0, 0);
                
                const assignmentPoints = timeSlot.points !== null ? timeSlot.points : 0;

                await prisma.assignment.create({
                  data: {
                    taskId,
                    userId: data.initialAssigneeId!,
                    dueDate: slotDueDate,
                    points: assignmentPoints,
                    rotationWeek: task.group.currentRotationWeek,
                    weekStart,
                    weekEnd,
                    assignmentDay: TaskHelpers.getDayOfWeekFromIndex(i),
                    completed: false,
                    timeSlotId: timeSlot.id
                  }
                });
              }
            }
          } else if (task.executionFrequency === 'WEEKLY') {
            // FIXED: Add type guard for selectedDays
            if (selectedDays && selectedDays.length > 0) {
              for (const day of selectedDays) {
                const baseDueDate = TaskHelpers.calculateDueDate(day, undefined);
                
                for (const timeSlot of timeSlots) {
                  const timeParts = timeSlot.startTime.split(':');
                  const hours = Number(timeParts[0]) || 18;
                  const minutes = Number(timeParts[1]) || 0;
                  
                  const slotDueDate = new Date(baseDueDate);
                  slotDueDate.setHours(hours, minutes, 0, 0);
                  
                  const assignmentPoints = timeSlot.points !== null ? timeSlot.points : 0;

                  await prisma.assignment.create({
                    data: {
                      taskId,
                      userId: data.initialAssigneeId!,
                      dueDate: slotDueDate,
                      points: assignmentPoints,
                      rotationWeek: task.group.currentRotationWeek,
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
          }
        } else {
          // Clear assignee if no initialAssigneeId provided
          updateData.currentAssignee = null;
          updateData.lastAssignedAt = null;
          
          // Delete assignments for current week
          await prisma.assignment.deleteMany({
            where: { 
              taskId, 
              rotationWeek: task.group.currentRotationWeek 
            }
          });
        }
      }

    const updatedTask = await prisma.task.update({
  where: { id: taskId },
  data: updateData,
  include: {
    group: { select: { id: true, name: true, currentRotationWeek: true } },
    creator: { select: { id: true, fullName: true, avatarUrl: true } },
    timeSlots: { orderBy: { sortOrder: 'asc' } }
  }
});

// 🔴 EMIT SOCKET EVENT FOR TASK UPDATED
await SocketService.emitTaskUpdated(updatedTask, updatedTask.group.id, userId);

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

  // Rotate group tasks - FIXED: Add type safety
 // Rotate group tasks - UPDATED with expired field handling
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

    // ✅ STEP 1: Mark previous week's incomplete assignments as expired
    const previousWeek = group.currentRotationWeek;
    
    const expiredCount = await prisma.assignment.updateMany({
      where: {
        task: {
          groupId: groupId
        },
        rotationWeek: previousWeek,
        completed: false,
        expired: false
      },
      data: {
        expired: true,
        expiredAt: new Date(),
        notes: `[EXPIRED: Week ended without completion on ${new Date().toLocaleDateString()}]`
      }
    });

    console.log(`✅ Marked ${expiredCount.count} incomplete assignments from week ${previousWeek} as expired`);

    // Get all recurring tasks with their points
    const tasks = await prisma.task.findMany({
      where: { 
        groupId, 
        isRecurring: true,
        isDeleted: false 
      },
      include: {
        timeSlots: { 
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            startTime: true,
            endTime: true,
            label: true,
            points: true
          }
        }
      },
      orderBy: { rotationOrder: 'asc' }
    });

    if (tasks.length === 0) {
      return { success: false, message: "No recurring tasks to rotate" };
    }

    // Get all active members with their cumulative points
    const members = await prisma.groupMember.findMany({
      where: { 
        groupId, 
        isActive: true 
      },
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
        cumulativePoints: 'asc' 
      }
    });

    if (members.length === 0) {
      return { success: false, message: "No active members in the group" };
    }

    // Calculate total points for each task (sum of all time slots)
    const tasksWithTotalPoints = tasks.map(task => {
      const totalPoints = task.timeSlots.reduce((sum, slot) => sum + (slot.points || 0), 0);
      return {
        ...task,
        totalPoints: totalPoints || task.points || 0 // Fallback to task.points if no time slots
      };
    });

    // Sort tasks by total points (HIGHEST to LOWEST)
    const sortedTasks = [...tasksWithTotalPoints].sort((a, b) => b.totalPoints - a.totalPoints);

    console.log('🔄 FAIR ROTATION ALGORITHM:');
    console.log('Members (lowest points first):', members.map(m => `${m.user?.fullName || 'Unknown'} (${m.cumulativePoints}pts)`));
    console.log('Tasks (highest points first):', sortedTasks.map(t => `${t.title} (${t.totalPoints}pts)`));

    const newWeek = group.currentRotationWeek + 1;
    const { weekStart, weekEnd } = TaskHelpers.getWeekBoundaries(1);
    const rotatedTasks = [];

    // FAIR ASSIGNMENT: Lowest points member gets highest points task
    for (let i = 0; i < members.length; i++) {
      const member = members[i]; // Lowest points first
      const task = sortedTasks[i]; // Highest points first
      
      // Skip if task is undefined (shouldn't happen if counts match)
      if (!task || !member) {
        console.warn(`Skipping assignment at index ${i}: member or task missing`);
        continue;
      }

      console.log(`Assigning ${member.user?.fullName || 'Unknown'} (${member.cumulativePoints}pts) → ${task.title} (${task.totalPoints}pts)`);

      // Update task with new assignee
      await prisma.task.update({
        where: { id: task.id },
        data: { 
          currentAssignee: member.userId, 
          lastAssignedAt: new Date() 
        }
      });

      // Delete existing assignments for next week
      await prisma.assignment.deleteMany({
        where: { 
          taskId: task.id, 
          rotationWeek: newWeek 
        }
      });

      // Get the time slots for this task (with their individual points)
      const timeSlots = task.timeSlots.length > 0 ? task.timeSlots : [{
        id: null,
        startTime: "00:00",
        endTime: "23:59",
        points: task.totalPoints
      }];

      // Create new assignments based on task frequency
      if (task.executionFrequency === 'DAILY') {
        // Daily tasks: create for each day of the week
        for (let day = 0; day < 7; day++) {
          const dueDate = new Date(weekStart);
          dueDate.setDate(dueDate.getDate() + day);
          
          for (const timeSlot of timeSlots) {
            const timeParts = timeSlot.startTime.split(':');
            const hours = Number(timeParts[0]) || 0;
            const minutes = Number(timeParts[1]) || 0;
            
            const slotDueDate = new Date(dueDate);
            slotDueDate.setHours(hours, minutes, 0, 0);
            
            await prisma.assignment.create({
              data: {
                taskId: task.id,
                userId: member.userId,
                dueDate: slotDueDate,
                points: timeSlot.points || task.totalPoints,
                rotationWeek: newWeek,
                weekStart,
                weekEnd,
                assignmentDay: TaskHelpers.getDayOfWeekFromIndex(day),
                completed: false,
                expired: false,
                ...(timeSlot.id ? { timeSlotId: timeSlot.id } : {})
              }
            });
          }
        }
      } else if (task.executionFrequency === 'WEEKLY') {
        // Weekly tasks: parse selected days
        let selectedDays: DayOfWeek[] = [];
        
        if (task.selectedDays) {
          try {
            selectedDays = JSON.parse(task.selectedDays as string);
          } catch {
            selectedDays = [];
          }
        }
        
        if (selectedDays.length === 0 && task.dayOfWeek) {
          selectedDays = [task.dayOfWeek];
        }
        
        if (selectedDays.length === 0) {
          selectedDays = ['MONDAY']; // Default fallback
        }
        
        for (const day of selectedDays) {
          // Create a time slot object with the weekStart time
          const weekStartTime = weekStart.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          
          const baseDueDate = TaskHelpers.calculateDueDate(day, { startTime: weekStartTime });
          
          for (const timeSlot of timeSlots) {
            const timeParts = timeSlot.startTime.split(':');
            const hours = Number(timeParts[0]) || 0;
            const minutes = Number(timeParts[1]) || 0;
            
            const slotDueDate = new Date(baseDueDate);
            slotDueDate.setHours(hours, minutes, 0, 0);
            
            await prisma.assignment.create({
              data: {
                taskId: task.id,
                userId: member.userId,
                dueDate: slotDueDate,
                points: timeSlot.points || task.totalPoints,
                rotationWeek: newWeek,
                weekStart,
                weekEnd,
                assignmentDay: day,
                completed: false,
                expired: false,
                ...(timeSlot.id ? { timeSlotId: timeSlot.id } : {})
              }
            });
          }
        }
      }

      // Update member's cumulative points (add this week's points)
      const taskPoints = task.totalPoints;
      await prisma.groupMember.update({
        where: { id: member.id },
        data: {
          cumulativePoints: {
            increment: taskPoints
          },
          pointsUpdatedAt: new Date()
        }
      });

      rotatedTasks.push({
        taskId: task.id,
        taskTitle: task.title,
        taskPoints,
        previousAssignee: task.currentAssignee,
        newAssignee: member.userId,
        newAssigneeName: member.user?.fullName || 'Unknown',
        oldCumulative: member.cumulativePoints,
        newCumulative: member.cumulativePoints + taskPoints
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

    // Calculate fairness metrics (with null checks)
    const updatedMembers = await prisma.groupMember.findMany({
      where: { groupId, isActive: true },
      include: { user: { select: { fullName: true } } },
      orderBy: { cumulativePoints: 'desc' }
    });

    // Safe access with null checks
    const maxPoints = updatedMembers.length > 0 ? updatedMembers[0]?.cumulativePoints || 0 : 0;
    const minPoints = updatedMembers.length > 0 ? updatedMembers[updatedMembers.length - 1]?.cumulativePoints || 0 : 0;
    const fairnessScore = maxPoints > 0 ? Math.round(100 - ((maxPoints - minPoints) / maxPoints) * 100) : 100;

    // Safe console logs with null checks
    console.log('✅ FAIRNESS PROOF:');
    if (members.length > 0 && sortedTasks.length > 0) {
      console.log(`Lowest points member (${members[0]?.user?.fullName || 'Unknown'} - ${members[0]?.cumulativePoints || 0}pts) → got highest task (${sortedTasks[0]?.title || 'Unknown'} - ${sortedTasks[0]?.totalPoints || 0}pts)`);
      console.log(`Highest points member (${members[members.length-1]?.user?.fullName || 'Unknown'} - ${members[members.length-1]?.cumulativePoints || 0}pts) → got lowest task (${sortedTasks[sortedTasks.length-1]?.title || 'Unknown'} - ${sortedTasks[sortedTasks.length-1]?.totalPoints || 0}pts)`);
    }

    return {
      success: true,
      message: `Rotated ${rotatedTasks.length} tasks to week ${newWeek}`,
      rotatedTasks,
      newWeek,
      weekStart,
      weekEnd,
      fairnessMetrics: {
        lowestPointsMember: members.length > 0 ? members[0]?.user?.fullName || 'Unknown' : 'Unknown',
        lowestPointsValue: members.length > 0 ? members[0]?.cumulativePoints || 0 : 0,
        gotHighestTask: sortedTasks.length > 0 ? sortedTasks[0]?.title || 'Unknown' : 'Unknown',
        gotHighestPoints: sortedTasks.length > 0 ? sortedTasks[0]?.totalPoints || 0 : 0,
        highestPointsMember: members.length > 0 ? members[members.length-1]?.user?.fullName || 'Unknown' : 'Unknown',
        highestPointsValue: members.length > 0 ? members[members.length-1]?.cumulativePoints || 0 : 0,
        gotLowestTask: sortedTasks.length > 0 ? sortedTasks[sortedTasks.length-1]?.title || 'Unknown' : 'Unknown',
        gotLowestPoints: sortedTasks.length > 0 ? sortedTasks[sortedTasks.length-1]?.totalPoints || 0 : 0,
        fairnessScore,
        afterRotationMax: maxPoints,
        afterRotationMin: minPoints,
        afterRotationDiff: maxPoints - minPoints
      }
    };

  } catch (error: any) {
    console.error("TaskService.rotateGroupTasks error:", error);
    return { success: false, message: error.message || "Error rotating tasks" };
  }
}
// In task.services.ts - Add this new method
static async rotateAssignedTasks(groupId: string, userId: string, taskIds: string[]) {
  try {
    console.log(`🔄 Rotating ${taskIds.length} assigned tasks for group ${groupId}`);
    
    // Get only the tasks that are assigned
    const tasks = await prisma.task.findMany({
      where: { 
        id: { in: taskIds },
        isRecurring: true,
        isDeleted: false,
        currentAssignee: { not: null } // Ensure they have assignees
      },
      include: {
        timeSlots: true,
        assignments: {
          where: { completed: false },
          take: 1
        }
      }
    });

    if (tasks.length === 0) {
      return { success: false, message: "No assigned tasks to rotate" };
    }

    // Get members with cumulative points
    const members = await prisma.groupMember.findMany({
      where: { groupId, isActive: true },
      include: { user: { select: { fullName: true } } },
      orderBy: { cumulativePoints: 'asc' }
    });

    // Sort tasks by points (highest to lowest)
    const sortedTasks = [...tasks].sort((a, b) => (b.points || 0) - (a.points || 0));

    console.log('🎯 Fair rotation for assigned tasks:');
    console.log('Members (lowest points first):', members.map(m => `${m.user.fullName} (${m.cumulativePoints}pts)`));
    console.log('Tasks (highest points first):', sortedTasks.map(t => `${t.title} (${t.points}pts)`));

    // Perform fair rotation
    const rotatedTasks = [];
    const newWeek = (await prisma.group.findUnique({ where: { id: groupId } }))!.currentRotationWeek + 1;
    const { weekStart, weekEnd } = TaskHelpers.getWeekBoundaries(1);

    for (let i = 0; i < tasks.length; i++) {
      const member = members[i % members.length]; // Cycle through members
      const task = sortedTasks[i];
      
      if (!task || !member) continue;

      console.log(`   Assigning ${member.user.fullName} → ${task.title}`);

      // Update task with new assignee
      await prisma.task.update({
        where: { id: task.id },
        data: { 
          currentAssignee: member.userId,
          lastAssignedAt: new Date()
        }
      });

      // Delete old assignments for next week
      await prisma.assignment.deleteMany({
        where: { 
          taskId: task.id, 
          rotationWeek: newWeek 
        }
      });

      // Create new assignments (simplified - you have your full logic)
      // ... your assignment creation logic here ...

      // Update member's cumulative points
      await prisma.groupMember.update({
        where: { id: member.id },
        data: {
          cumulativePoints: { increment: task.points || 0 }
        }
      });

      rotatedTasks.push({
        taskId: task.id,
        title: task.title,
        assignedTo: member.user.fullName
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
      message: `Rotated ${rotatedTasks.length} assigned tasks`,
      rotatedTasks
    };

  } catch (error: any) {
    console.error("Error rotating assigned tasks:", error);
    return { success: false, message: error.message };
  }
}

// Get rotation schedule - FIXED to show ACTUAL assignments
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

    // Get all recurring tasks
    const tasks = await prisma.task.findMany({
      where: { groupId, isRecurring: true },
      include: {
        timeSlots: { 
          orderBy: { sortOrder: 'asc' },
          select: { 
            id: true, 
            startTime: true, 
            endTime: true, 
            label: true,
            points: true 
          }
        }
      },
      orderBy: { rotationOrder: 'asc' }
    });

    const schedule = [];

    // Show only current and past weeks (no future weeks)
    for (let weekOffset = 0; weekOffset < weeks; weekOffset++) {
      const weekNumber = group.currentRotationWeek - weekOffset; // Go backwards from current week
      
      // Stop if we go below week 1
      if (weekNumber < 1) continue;
      
      const { weekStart, weekEnd } = TaskHelpers.getWeekBoundaries(-weekOffset); // Negative offset for past weeks

      const weekSchedule: any = {
        week: weekNumber,
        weekStart,
        weekEnd,
        tasks: []
      };

      // For each task, get the ACTUAL assignments for this week
      for (const task of tasks) {
        // Get the actual assignment for this specific week
        const actualAssignment = await prisma.assignment.findFirst({
          where: {
            taskId: task.id,
            rotationWeek: weekNumber
          },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true
              }
            },
            timeSlot: true
          }
        });

        // Get selected days
        const selectedDays = TaskHelpers.safeJsonParse<DayOfWeek>(task.selectedDays as any) || 
                             (task.dayOfWeek ? [task.dayOfWeek] : []);

        weekSchedule.tasks.push({
          taskId: task.id,
          taskTitle: task.title,
          executionFrequency: task.executionFrequency,
          timeSlots: task.timeSlots || [],
          selectedDays: selectedDays,
          // Use ACTUAL assignment data, not projected
          assignee: actualAssignment?.user ? {
            id: actualAssignment.user.id,
            name: actualAssignment.user.fullName,
            avatarUrl: actualAssignment.user.avatarUrl
          } : null,
          // If no assignment exists for this week, it means the task wasn't assigned
          // (either task was created after this week or no assignment was created)
          points: actualAssignment?.points || task.points,
          completed: actualAssignment?.completed || false,
          actualAssignment: !!actualAssignment // Flag to indicate if this is an actual assignment
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

 // In task.services.ts - UPDATED reassignTask method
static async reassignTask(taskId: string, userId: string, targetUserId: string) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { 
        group: {
          include: {
            members: {
              where: { isActive: true },
              include: {
                user: {
                  select: { id: true, fullName: true, avatarUrl: true }
                }
              }
            }
          }
        },
        timeSlots: { orderBy: { sortOrder: 'asc' } }
      }
    });

    if (!task) {
      return { success: false, message: "Task not found" };
    }

    // Check if user is admin
    const membership = await prisma.groupMember.findFirst({
      where: { userId, groupId: task.groupId, groupRole: "ADMIN" }
    });

    if (!membership) {
      return { success: false, message: "Only group admins can reassign tasks" };
    }

    // ✅ Check if target user is an active member of the group
    const targetMember = task.group.members.find(m => m.userId === targetUserId);
    
    if (!targetMember) {
      return { success: false, message: "Target user is not an active member of this group" };
    }

    // ✅ Get all active members for rotation update
    const allActiveMembers = task.group.members.map(m => ({
      userId: m.userId,
      fullName: m.user.fullName,
      avatarUrl: m.user.avatarUrl,
      rotationOrder: m.rotationOrder,
      groupRole: m.groupRole
    }));

    // ✅ Update task's rotationMembers to include all active members
    await prisma.task.update({
      where: { id: taskId },
      data: {
        rotationMembers: allActiveMembers as any
      }
    });

    const { weekStart, weekEnd } = TaskHelpers.getWeekBoundaries();

    // Delete existing assignments for current week
    await prisma.assignment.deleteMany({
      where: { 
        taskId, 
        rotationWeek: task.group.currentRotationWeek 
      }
    });

    // Create new assignments for target user
    if (task.executionFrequency === 'DAILY') {
      for (let i = 0; i < 7; i++) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + i);
        
        for (const timeSlot of task.timeSlots) {
          const timeParts = timeSlot.startTime.split(':');
          const hours = Number(timeParts[0]) || 18;
          const minutes = Number(timeParts[1]) || 0;
          
          const slotDueDate = new Date(dueDate);
          slotDueDate.setHours(hours, minutes, 0, 0);
          
          const assignmentPoints = timeSlot.points !== null ? timeSlot.points : 0;

          await prisma.assignment.create({
            data: {
              taskId,
              userId: targetUserId,
              dueDate: slotDueDate,
              points: assignmentPoints,
              rotationWeek: task.group.currentRotationWeek,
              weekStart,
              weekEnd,
              assignmentDay: TaskHelpers.getDayOfWeekFromIndex(i),
              completed: false,
              timeSlotId: timeSlot.id
            }
          });
        }
      }
    } else if (task.executionFrequency === 'WEEKLY') {
      const selectedDays = TaskHelpers.safeJsonParse<DayOfWeek>(task.selectedDays as any) || 
                           (task.dayOfWeek ? [task.dayOfWeek] : []);
      
      if (selectedDays && selectedDays.length > 0) {
        for (const day of selectedDays) {
          const baseDueDate = TaskHelpers.calculateDueDate(day, undefined);
          
          for (const timeSlot of task.timeSlots) {
            const timeParts = timeSlot.startTime.split(':');
            const hours = Number(timeParts[0]) || 18;
            const minutes = Number(timeParts[1]) || 0;
            
            const slotDueDate = new Date(baseDueDate);
            slotDueDate.setHours(hours, minutes, 0, 0);
            
            const assignmentPoints = timeSlot.points !== null ? timeSlot.points : 0;

            await prisma.assignment.create({
              data: {
                taskId,
                userId: targetUserId,
                dueDate: slotDueDate,
                points: assignmentPoints,
                rotationWeek: task.group.currentRotationWeek,
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
    }

    // Update task with new assignee
    await prisma.task.update({
      where: { id: taskId },
      data: { 
        currentAssignee: targetUserId,
        lastAssignedAt: new Date()
      }
    });

    // 🔴 EMIT SOCKET EVENT FOR TASK ASSIGNED
    await SocketService.emitTaskAssigned(
      taskId,
      task.title,
      targetUserId,
      userId,
      task.groupId,
      new Date()
    );

    return {
      success: true,
      message: "Task reassigned successfully",
      newAssignee: targetMember.user
    };

  } catch (error: any) {
    console.error("TaskService.reassignTask error:", error);
    return { success: false, message: error.message || "Error reassigning task" };
  }
}

  // Get task points summary - FIXED: Handle undefined points
  static async getTaskPointsSummary(taskId: string, userId: string) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          timeSlots: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              startTime: true,
              endTime: true,
              label: true,
              points: true
            }
          },
          group: {
            select: { currentRotationWeek: true }
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

      // Calculate points distribution - FIXED: Handle null points
      const timeSlotPoints = task.timeSlots.map(slot => ({
        timeSlotId: slot.id,
        timeRange: `${slot.startTime} - ${slot.endTime}`,
        label: slot.label || `Time Slot`,
        points: slot.points || 0,
        percentage: (slot.points && task.points && task.points > 0) ? (slot.points / task.points) * 100 : 0
      }));

      // Get assignments for current week
      const assignments = await prisma.assignment.findMany({
        where: {
          taskId,
          rotationWeek: task.group?.currentRotationWeek
        },
        include: {
          user: {
            select: { fullName: true, avatarUrl: true }
          },
          timeSlot: true
        }
      });

      const pointsByUser: Record<string, { 
        userId: string; 
        userName: string; 
        avatarUrl?: string; 
        totalPoints: number; 
        assignments: any[] 
      }> = {};

      assignments.forEach(assignment => {
        if (!pointsByUser[assignment.userId]) {
          pointsByUser[assignment.userId] = {
            userId: assignment.userId,
            userName: assignment.user.fullName,
            avatarUrl: assignment.user.avatarUrl || undefined,
            totalPoints: 0,
            assignments: []
          };
        }
        pointsByUser[assignment.userId]!.totalPoints += assignment.points;
        pointsByUser[assignment.userId]!.assignments.push({
          assignmentId: assignment.id,
          dueDate: assignment.dueDate,
          timeSlot: assignment.timeSlot,
          points: assignment.points,
          completed: assignment.completed
        });
      });

      return {
        success: true,
        message: "Points summary retrieved",
        summary: {
          taskId: task.id,
          taskTitle: task.title,
          totalPoints: task.points,
          timeSlotDistribution: timeSlotPoints,
          pointsByUser: Object.values(pointsByUser),
          weeklyTotal: assignments.reduce((sum, a) => sum + a.points, 0)
        }
      };

    } catch (error: any) {
      console.error("TaskService.getTaskPointsSummary error:", error);
      return { success: false, message: error.message || "Error retrieving points summary" };
    }
  }

  // Delete a task
  static async deleteTask(taskId: string, userId: string) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { 
        group: true,
        assignments: {
          include: {
            user: {
              select: { id: true, fullName: true }
            }
          }
        }
      }
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

    // ===== SOFT DELETE - mark as deleted instead of actual delete =====
    await prisma.task.update({
      where: { id: taskId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: userId,
        title: `[DELETED] ${task.title}` // Optional: mark title as deleted
      }
    });

    // Create notifications for affected users (optional)
    const affectedUserIds = new Set<string>();
    task.assignments?.forEach(assignment => {
      affectedUserIds.add(assignment.userId);
    });

    // Create notifications for each affected user
    for (const affectedUserId of affectedUserIds) {
      await prisma.userNotification.create({
        data: {
          userId: affectedUserId,
          type: "TASK_DELETED",
          title: "🗑️ Task Deleted",
          message: `The task "${task.title}" has been deleted by an admin. Your history and points are preserved.`,
          data: {
            taskId: task.id,
            taskTitle: task.title,
            groupId: task.groupId,
            groupName: task.group.name
          }
        }
      });
    }

    // 🔴 EMIT SOCKET EVENT FOR TASK DELETED
    await SocketService.emitTaskDeleted(taskId, task.title, task.groupId, userId);

    return { 
      success: true, 
      message: "Task deleted successfully. User history and points preserved.",
      preservedAssignments: task.assignments?.length || 0
    };

  } catch (error: any) {
    console.error("TaskService.deleteTask error:", error);
    return { success: false, message: error.message || "Error deleting task" };
  }
}

  // Get task statistics
  static async getTaskStatistics(groupId: string, userId: string) {
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

      // Get total tasks in group
      const totalTasks = await prisma.task.count({
        where: { groupId }
      });

      // Get recurring tasks count
      const recurringTasks = await prisma.task.count({
        where: { groupId, isRecurring: true }
      });

      // Get tasks with time slots
      const tasksWithTimeSlots = await prisma.task.count({
        where: { 
          groupId,
          timeSlots: { some: {} }
        }
      });

      // Get tasks by frequency
      const dailyTasks = await prisma.task.count({
        where: { groupId, executionFrequency: 'DAILY' }
      });

      const weeklyTasks = await prisma.task.count({
        where: { groupId, executionFrequency: 'WEEKLY' }
      });

      // Get assignments statistics for current week
      const currentWeekAssignments = await prisma.assignment.findMany({
        where: { 
          task: { groupId },
          rotationWeek: group.currentRotationWeek 
        },
        include: {
          task: true,
          user: { select: { fullName: true } }
        }
      });

      const completedAssignments = currentWeekAssignments.filter(a => a.completed);
      const pendingAssignments = currentWeekAssignments.filter(a => !a.completed);

      // Calculate total points
      const totalPoints = currentWeekAssignments.reduce((sum, a) => sum + a.points, 0);
      const completedPoints = completedAssignments.reduce((sum, a) => sum + a.points, 0);
      const pendingPoints = pendingAssignments.reduce((sum, a) => sum + a.points, 0);

      // Get user's assignments for current week
      const userAssignments = currentWeekAssignments.filter(a => a.userId === userId);
      const userCompleted = userAssignments.filter(a => a.completed);
      const userPending = userAssignments.filter(a => !a.completed);

      return {
        success: true,
        message: "Task statistics retrieved",
        statistics: {
          totalTasks,
          recurringTasks,
          tasksWithTimeSlots,
          dailyTasks,
          weeklyTasks,
          currentWeek: {
            weekNumber: group.currentRotationWeek,
            totalAssignments: currentWeekAssignments.length,
            completedAssignments: completedAssignments.length,
            pendingAssignments: pendingAssignments.length,
            totalPoints,
            completedPoints,
            pendingPoints
          },
          userStats: {
            totalAssignments: userAssignments.length,
            completed: userCompleted.length,
            pending: userPending.length,
            userPoints: userCompleted.reduce((sum, a) => sum + a.points, 0)
          }
        }
      };

    } catch (error: any) {
      console.error("TaskService.getTaskStatistics error:", error);
      return { success: false, message: error.message || "Error retrieving task statistics" };
    }
  }
  
  // services/task.services.ts - ADD this method to your TaskService class
static async getCurrentTimeSlotInfo(taskId: string, userId: string) {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        timeSlots: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            startTime: true,
            endTime: true,
            label: true,
            points: true
          }
        },
        assignments: {
          where: {
            userId,
            rotationWeek: {
              gte: 1 // Get current and future assignments
            }
          },
          include: {
            timeSlot: true
          },
          orderBy: { dueDate: 'asc' }
        }
      }
    });

    if (!task) {
      return { success: false, message: "Task not found" };
    }

    const now = new Date();
    const today = now.toDateString();
    
    // Find today's assignment
    const todaysAssignment = task.assignments.find(assignment => {
      const dueDate = new Date(assignment.dueDate);
      return dueDate.toDateString() === today;
    });

    let currentSlot = null;
    let nextSlot = null;
    let isSubmittable = false;
    let timeLeft = null;
    let submissionInfo = null;

    if (todaysAssignment?.timeSlot) {
      // Check time validation for today's assignment
      const validation = TimeHelpers.canSubmitAssignment(todaysAssignment, now);
      currentSlot = todaysAssignment.timeSlot;
      isSubmittable = validation.allowed;
      timeLeft = validation.timeLeft;
      submissionInfo = validation;
    } else if (task.timeSlots && task.timeSlots.length > 0) {
      // Check if current time is within any time slot
      currentSlot = TimeHelpers.isWithinAnyTimeSlot(task.timeSlots, now);
      
      if (currentSlot) {
        // Create a mock assignment for validation
        const mockAssignment = {
          dueDate: now,
          timeSlot: currentSlot
        };
        const validation = TimeHelpers.canSubmitAssignment(mockAssignment, now);
        isSubmittable = validation.allowed;
        timeLeft = validation.timeLeft;
        submissionInfo = validation;
      }
      
      // Get next upcoming slot
      nextSlot = TimeHelpers.getNextTimeSlot(task.timeSlots, now);
    }

    return {
      success: true,
      message: "Time slot information retrieved",
      data: {
        hasAssignmentToday: !!todaysAssignment,
        assignment: todaysAssignment,
        currentTimeSlot: currentSlot,
        nextTimeSlot: nextSlot,
        isSubmittable,
        timeLeft,
        timeLeftText: timeLeft ? TimeHelpers.getTimeLeftText(timeLeft) : null,
        submissionInfo,
        currentTime: now
      }
    };

  } catch (error: any) {
    console.error("TaskService.getCurrentTimeSlotInfo error:", error);
    return { success: false, message: error.message || "Error retrieving time slot info" };
  }
}

} 