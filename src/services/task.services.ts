// services/task.services.ts
import prisma from "../prisma";
import { TaskExecutionFrequency, Prisma,DayOfWeek } from '@prisma/client';
import { TaskHelpers } from "../helpers/task.helpers";
import { TimeHelpers } from "../helpers/time.helpers";
import { SocketService } from "./socket.services";
import { RotationHelpers } from "../helpers/rotation.helpers";
export class TaskService { 
  
// In task.services.ts - COMPLETE FIXED createTask method
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
    selectedDays?: any[];
    dayOfWeek?: any;
    isRecurring?: boolean;
    rotationMemberIds?: string[];
    rotationOrder?: number;
    timeSlots?: Array<{
      startTime: string;
      endTime: string;
      label?: string;
      points?: string | number;
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

    // ===== CREATION DAY LOCK =====
    // The day the first task was created is the locked creation day.
    // All future tasks must be created on that same day of the week.
    const existingTasks = await prisma.task.findMany({
      where: { groupId, isRecurring: true },
      orderBy: { createdAt: 'asc' },
      take: 1,
      select: { createdAt: true }
    });

    if (existingTasks.length > 0) {
      const firstTask = existingTasks[0]!;
      const lockedDayIndex = firstTask.createdAt.getUTCDay();
      const todayIndex = new Date().getUTCDay();

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      if (todayIndex !== lockedDayIndex) {
        return {
          success: false,
          message: `Tasks can only be created on ${dayNames[lockedDayIndex]}s to maintain rotation consistency. Today is ${dayNames[todayIndex]}.`
        };
      }

      console.log(`✅ Creation day check passed: Today is ${dayNames[todayIndex]}, locked day is ${dayNames[lockedDayIndex]}`);
    } else {
      console.log(`✅ First task for this group — locking creation day to today (${new Date().toLocaleDateString('en-US', { weekday: 'long' })})`);
    }
    // ===== END CREATION DAY LOCK =====

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

    // If this is a recurring task
    if (data.isRecurring) {
      const memberCount = analysis.membersInRotation;
      const currentTasks = analysis.totalTasks;
      
      if (currentTasks < memberCount) {
        console.log(`✅ Creating task ${currentTasks + 1}/${memberCount} for rotation (members in rotation: ${memberCount})`);
      } else if (currentTasks === memberCount) {
        console.log(`✅ Perfect rotation reached (${memberCount}/${memberCount}). Creating extra task.`);
      } else {
        console.log(`✅ Creating extra task (current: ${currentTasks}/${memberCount})`);
      }
    }

    // Get rotation members - EXCLUDE ADMINS
    let targetMemberIds = data.rotationMemberIds || [];
    let rotationMembers = [];

    if (targetMemberIds.length > 0) {
      const validMembers = await prisma.groupMember.findMany({
        where: { 
          groupId, 
          userId: { in: targetMemberIds }, 
          isActive: true,
          inRotation: true
        },
        include: { user: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { rotationOrder: 'asc' }
      });

      if (validMembers.length !== targetMemberIds.length) {
        return { success: false, message: "Some selected members are not in rotation or are inactive" };
      }
      rotationMembers = validMembers;
    } else {
      rotationMembers = await prisma.groupMember.findMany({
        where: { 
          groupId, 
          isActive: true,
          inRotation: true
        },
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

    const taskData: Prisma.TaskCreateInput = {
      title: data.title.trim(),
      description: data.description?.trim() || undefined,
      points: totalPoints,
      executionFrequency: data.executionFrequency,
      timeFormat: data.timeFormat || '12h',
      dayOfWeek: data.dayOfWeek || undefined,
      isRecurring: data.isRecurring !== false,
      category: data.category?.trim() || undefined,
      rotationOrder: finalRotationOrder,
      rotationMembers: rotationMembersJson as any,
      selectedDays: data.executionFrequency === 'WEEKLY' && selectedDaysArray && selectedDaysArray.length > 0
        ? selectedDaysArray as any 
        : null,
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
            points: slot.points,
            sortOrder: index,
            isPrimary: index === 0
          }
        })
      );

      createdSlots = await Promise.all(timeSlotPromises);
      
      if (createdSlots.length > 0) {
        await prisma.task.update({
          where: { id: task.id },
          data: { primaryTimeSlotId: createdSlots[0].id }
        });
      }
    } else {
      const defaultSlot = await prisma.timeSlot.create({
        data: {
          taskId: task.id,
          startTime: "18:00",
          endTime: "19:00",
          label: "Default",
          points: totalPoints,
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

    if (initialAssignee) {
      const slotPointsMap: Record<string, number> = {};
      createdSlots.forEach(slot => {
        slotPointsMap[slot.id] = slot.points || 0;
      });
      
      const totalSlotPoints = Object.values(slotPointsMap).reduce((sum, p) => sum + p, 0);
      
      console.log(`🔵🔵🔵 [CREATE TASK] Creating assignments 🔵🔵🔵`);
      console.log(`👤 User: ${initialAssignee.user?.fullName} (${initialAssignee.userId})`);
      console.log(`📅 Execution Frequency: ${data.executionFrequency}`);
      console.log(`📅 Group Current Rotation Week: ${group.currentRotationWeek}`);
      console.log(`📅 Current Date/Time: ${new Date().toISOString()}`);
      console.log(`📅 Current Day: ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}`);

      const dayNames: Record<number, DayOfWeek> = {
        0: 'SUNDAY',
        1: 'MONDAY',
        2: 'TUESDAY',
        3: 'WEDNESDAY',
        4: 'THURSDAY',
        5: 'FRIDAY',
        6: 'SATURDAY'
      };

      if (data.executionFrequency === 'DAILY') {
        console.log(`\n📅 Creating DAILY assignments`);
        
        const now = new Date();
        const todayUTC = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          0, 0, 0, 0
        ));
        
        console.log(`   Today UTC (midnight): ${todayUTC.toISOString()}`);
        console.log(`   Today UTC day index: ${todayUTC.getUTCDay()}`);
        console.log(`\n   Creating assignments for next 7 days:`);
        
        for (let i = 0; i < 7; i++) {
          const dueDateUTC = new Date(todayUTC);
          dueDateUTC.setUTCDate(todayUTC.getUTCDate() + i);
          
          const utcDayIndex = dueDateUTC.getUTCDay();
          const actualDayName = dayNames[utcDayIndex];
          
          console.log(`\n   ┌─────────────────────────────────────────`);
          console.log(`   │ Day ${i}:`);
          console.log(`   │   UTC Date: ${dueDateUTC.toISOString()}`);
          console.log(`   │   UTC Day Index: ${utcDayIndex}`);
          console.log(`   │   Assignment Day: ${actualDayName}`);
          console.log(`   └─────────────────────────────────────────`);
          
          for (const timeSlot of createdSlots) {
            const timeParts = timeSlot.startTime.split(':');
            const hours = Number(timeParts[0]) || 18;
            const minutes = Number(timeParts[1]) || 0;
            
            const slotDueDateUTC = new Date(dueDateUTC);
            slotDueDateUTC.setUTCHours(hours, minutes, 0, 0);
            
            const assignmentPoints = timeSlot.points !== null ? timeSlot.points : 0;

            await prisma.assignment.create({
              data: {
                taskId: task.id,
                userId: initialAssignee.userId,
                dueDate: slotDueDateUTC,
                points: assignmentPoints,
                rotationWeek: group.currentRotationWeek,
                weekStart: dueDateUTC,
                weekEnd: new Date(dueDateUTC.getTime() + 24 * 60 * 60 * 1000),
                assignmentDay: actualDayName,
                completed: false,
                timeSlotId: timeSlot.id,
                originalTotalPoints: totalSlotPoints,
                slotPoints: slotPointsMap,
                missedTimeSlotIds: []
              }
            });
            console.log(`         ✅ Created: ${actualDayName} at ${timeSlot.startTime}-${timeSlot.endTime} (${assignmentPoints} pts)`);
          }
        }
        
        console.log(`\n✅ DAILY assignments creation completed`);
      }

      if (data.executionFrequency === 'WEEKLY') {
        let selectedDaysArray = data.selectedDays;
        if (!selectedDaysArray && data.dayOfWeek) {
          selectedDaysArray = [data.dayOfWeek];
        }
        
        if (selectedDaysArray && selectedDaysArray.length > 0) {
          console.log(`\n🔍🔍🔍 [DEBUG] WEEKLY TASK CREATION 🔍🔍🔍`);
          console.log(`📅 RAW selectedDaysArray:`, JSON.stringify(selectedDaysArray));
          console.log(`📅 Execution Frequency: ${data.executionFrequency}`);
          
          const now = new Date();
          const creationDateUTC = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
            0, 0, 0, 0
          ));
          
          const dayToIndex: Record<string, number> = {
            'SUNDAY': 0, 'MONDAY': 1, 'TUESDAY': 2, 'WEDNESDAY': 3,
            'THURSDAY': 4, 'FRIDAY': 5, 'SATURDAY': 6
          };
          
          const creationDayIndex = creationDateUTC.getUTCDay();
          
          console.log(`📅 creationDayIndex: ${creationDayIndex}`);
          console.log(`📅 creationDayName: ${Object.keys(dayToIndex).find(key => dayToIndex[key] === creationDayIndex)}`);
          
          const validDays = selectedDaysArray.filter((day: string) => dayToIndex[day] !== undefined);
          
          const daysInOrder = [...validDays].sort((a, b) => {
            const indexA = dayToIndex[a];
            const indexB = dayToIndex[b];
            if (indexA === undefined || indexB === undefined) return 0;
            let relativeA = indexA < creationDayIndex ? indexA + 7 : indexA;
            let relativeB = indexB < creationDayIndex ? indexB + 7 : indexB;
            return relativeA - relativeB;
          });
          
          console.log(`📅 daysInOrder:`, daysInOrder);
          console.log(`📅 Creation day index: ${creationDayIndex}`);
          
          for (let i = 0; i < daysInOrder.length; i++) {
            const day = daysInOrder[i];
            const targetDayIndex = dayToIndex[day];
            
            if (targetDayIndex === undefined) {
              console.warn(`⚠️ Unknown day: ${day}, skipping`);
              continue;
            }
            
            let daysToAdd = targetDayIndex - creationDayIndex;
            if (daysToAdd < 0) daysToAdd += 7;
            
            const dueDateUTC = new Date(creationDateUTC);
            dueDateUTC.setUTCDate(creationDateUTC.getUTCDate() + daysToAdd);
            dueDateUTC.setUTCHours(0, 0, 0, 0);
            
            console.log(`   Day ${i+1}: ${day} → ${dueDateUTC.toISOString()} (days to add: ${daysToAdd})`);
            
            for (const timeSlot of createdSlots) {
              const timeParts = timeSlot.startTime.split(':');
              const hours = Number(timeParts[0]) || 18;
              const minutes = Number(timeParts[1]) || 0;
              
              const slotDueDateUTC = new Date(dueDateUTC);
              slotDueDateUTC.setUTCHours(hours, minutes, 0, 0);
              
              const assignmentPoints = timeSlot.points !== null ? timeSlot.points : 0;

              await prisma.assignment.create({
                data: {
                  taskId: task.id,
                  userId: initialAssignee.userId,
                  dueDate: slotDueDateUTC,
                  points: assignmentPoints,
                  rotationWeek: group.currentRotationWeek,
                  weekStart: dueDateUTC,
                  weekEnd: new Date(dueDateUTC.getTime() + 24 * 60 * 60 * 1000),
                  assignmentDay: day as DayOfWeek,
                  completed: false,
                  expired: false,
                  timeSlotId: timeSlot.id,
                  originalTotalPoints: totalSlotPoints,
                  slotPoints: slotPointsMap,
                  missedTimeSlotIds: []
                }
              });
              console.log(`         ✅ Created: ${day} at ${timeSlot.startTime}-${timeSlot.endTime} (${assignmentPoints} pts)`);
            }
          }
          
          console.log(`\n✅ WEEKLY assignments creation completed. Created ${daysInOrder.length} day assignments`);
        } else {
          console.log(`⚠️ WARNING: No selected days for weekly task!`);
        }
      }

      console.log(`🔵🔵🔵 [CREATE TASK] Completed assignments creation 🔵🔵🔵`);
    }

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

    await SocketService.emitTaskCreated(completeTask, groupId, userId);

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

// In task.services.ts - FIXED version without type issues

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

    // Get today's date info
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get CURRENT assignments (tasks still exist)
    const currentAssignments = await prisma.assignment.findMany({
      where: { 
        userId, 
        task: { groupId },
        rotationWeek: targetWeek 
      },
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

    // Get HISTORICAL assignments (tasks that were deleted)
    const historicalAssignments = await prisma.assignment.findMany({
      where: { 
        userId, 
        taskId: null,
        taskTitle: { not: null }
      },
      include: {
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

    // ✅ FIXED: Get swap information using a separate query without the relation
    // First get the swap requests
    const userSwapRequests = await prisma.swapRequest.findMany({
      where: {
        OR: [
          { acceptedBy: userId },
          { targetUserId: userId, status: 'ACCEPTED' }
        ],
        status: 'ACCEPTED'
      },
      select: {
        id: true,
        assignmentId: true,
        requestedBy: true,
        scope: true,
        selectedDay: true
      }
    });

    // ✅ Then separately get the requester names for each swap request
    const swapInfoMap = new Map();
    for (const swap of userSwapRequests) {
      let swappedFromName = 'another member';
      
      if (swap.requestedBy) {
        const requester = await prisma.user.findUnique({
          where: { id: swap.requestedBy },
          select: { fullName: true }
        });
        if (requester?.fullName) {
          swappedFromName = requester.fullName;
        }
      }
      
      swapInfoMap.set(swap.assignmentId, {
        acquiredViaSwap: true,
        swapRequestId: swap.id,
        swappedFromId: swap.requestedBy,
        swappedFromName: swappedFromName,
        swapScope: swap.scope,
        swapDay: swap.selectedDay
      });
    }

    // Format current assignments with swap info
    const currentTasks = currentAssignments
      .filter(assignment => assignment.task !== null)
      .map(assignment => {
        const task = assignment.task!;
        const swapInfo = swapInfoMap.get(assignment.id);
        
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
          createdAt: task.createdAt,
          creator: task.creator,
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
            isDueToday: assignment.dueDate >= today && assignment.dueDate < tomorrow,
            isHistorical: false,
            acquiredViaSwap: swapInfo?.acquiredViaSwap || false,
            swapRequestId: swapInfo?.swapRequestId || null,
            swappedFromId: swapInfo?.swappedFromId || null,
            swappedFromName: swapInfo?.swappedFromName || null,
            swapScope: swapInfo?.swapScope || null,
            swapDay: swapInfo?.swapDay || null
          }
        };
      });

    // Format historical assignments
    const historicalTasks = historicalAssignments.map(assignment => ({
      id: `historical-${assignment.id}`,
      title: assignment.taskTitle || "Deleted Task",
      description: null,
      points: assignment.taskPoints || assignment.points,
      category: assignment.taskCategory,
      executionFrequency: null,
      timeFormat: null,
      timeSlots: [],
      selectedDays: [],
      dayOfWeek: null,
      isRecurring: false,
      rotationOrder: null,
      createdAt: assignment.createdAt,
      creator: null,
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
        isDueToday: false,
        isHistorical: true,
        deletedTaskName: assignment.taskTitle,
        acquiredViaSwap: false,
        swapRequestId: null,
        swappedFromId: null,
        swappedFromName: null,
        swapScope: null,
        swapDay: null
      }
    }));

    // Combine both types of tasks
    const allTasks = [...currentTasks, ...historicalTasks];

    return {
      success: true,
      message: "Your tasks retrieved successfully",
      tasks: allTasks,
      currentWeek: group.currentRotationWeek,
      weekStart,
      weekEnd,
      currentDate: {
        today,
        tomorrow
      },
      stats: {
        total: allTasks.length,
        current: currentTasks.length,
        historical: historicalTasks.length,
        swapped: currentTasks.filter(t => t.assignment?.acquiredViaSwap === true).length
      }
    };  

  } catch (error: any) {
    console.error("TaskService.getUserTasks error:", error);
    return { success: false, message: error.message || "Error retrieving your tasks" };
  }
}


// In task.services.ts - FIXED getTaskDetails method

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

    // Calculate today's date info
    const today = new Date(); 
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // ✅ FIXED: Get swap information for the user's assignment
    let swapInfo = null;
    if (userAssignment) {
      // First get the swap request without the relation
      const swapRequest = await prisma.swapRequest.findFirst({
        where: {
          OR: [
            { acceptedBy: userId, assignmentId: userAssignment.id },
            { targetUserId: userId, assignmentId: userAssignment.id, status: 'ACCEPTED' }
          ],
          status: 'ACCEPTED'
        },
        select: {
          id: true,
          requestedBy: true,
          scope: true,
          selectedDay: true,
          createdAt: true
        }
      });
      
      if (swapRequest) {
        // Then get the requester's name separately
        let swappedFromName = 'another member';
        if (swapRequest.requestedBy) {
          const requester = await prisma.user.findUnique({
            where: { id: swapRequest.requestedBy },
            select: { fullName: true }
          });
          if (requester?.fullName) {
            swappedFromName = requester.fullName;
          }
        }
        
        swapInfo = {
          acquiredViaSwap: true,
          swapRequestId: swapRequest.id,
          swappedFromId: swapRequest.requestedBy,
          swappedFromName: swappedFromName,
          swapScope: swapRequest.scope,
          swapDay: swapRequest.selectedDay,
          swapCreatedAt: swapRequest.createdAt
        };
      }
    }

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
        selectedDays: task.selectedDays ? TaskHelpers.safeJsonParse(task.selectedDays) : [],
        dayOfWeek: task.dayOfWeek,
        isRecurring: task.isRecurring,
        category: task.category,
        rotationOrder: task.rotationOrder,
        currentAssignee: task.currentAssignee,
        lastAssignedAt: task.lastAssignedAt,
        createdAt: task.createdAt,
        group: task.group,
        creator: task.creator,
        assignments: assignmentsWithDueInfo,
        userAssignment: userAssignment ? {
          ...userAssignment,
          acquiredViaSwap: swapInfo?.acquiredViaSwap || false,
          swapRequestId: swapInfo?.swapRequestId || null,
          swappedFromId: swapInfo?.swappedFromId || null,
          swappedFromName: swapInfo?.swappedFromName || null,
          swapScope: swapInfo?.swapScope || null,
          swapDay: swapInfo?.swapDay || null,
          swapCreatedAt: swapInfo?.swapCreatedAt || null
        } : null,
        totalAssignments: task.assignments.length,
        rotationMembers: rotationMembers,
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

        // ✅ For DAILY tasks, set to null
  if (data.executionFrequency === 'DAILY') {
    updateData.selectedDays = Prisma.DbNull;
  } else {
    updateData.selectedDays = selectedDaysArray as Prisma.JsonArray;
  }

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

 // services/task.services.ts - FIXED rotateGroupTasks (REMOVE points addition)

// Rotate group tasks - UPDATED with expired field handling (NO POINTS ADDED HERE)
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

    // STEP 1: Mark previous week's incomplete assignments as expired
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

    // Get all active members that are in rotation (EXCLUDE ADMINS)
    const members = await prisma.groupMember.findMany({
      where: { 
        groupId, 
        isActive: true,
        inRotation: true
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
      return { success: false, message: "No active members in rotation" };
    }

    // Calculate total points for each task (sum of all time slots)
    const tasksWithTotalPoints = tasks.map(task => {
      const totalPoints = task.timeSlots.reduce((sum, slot) => sum + (slot.points || 0), 0);
      return {
        ...task,
        totalPoints: totalPoints || task.points || 0
      };
    });

    // Sort tasks by total points (HIGHEST to LOWEST)
    const sortedTasks = [...tasksWithTotalPoints].sort((a, b) => b.totalPoints - a.totalPoints);

    console.log('🔄 FAIR ROTATION ALGORITHM:');
    console.log('Members in rotation (lowest points first):', members.map(m => `${m.user?.fullName || 'Unknown'} (${m.cumulativePoints}pts)`));
    console.log('Tasks (highest points first):', sortedTasks.map(t => `${t.title} (${t.totalPoints}pts)`));

    const newWeek = group.currentRotationWeek + 1;
    const { weekStart, weekEnd } = TaskHelpers.getWeekBoundaries(1);
    const rotatedTasks = [];

    // FAIR ASSIGNMENT: Lowest points member gets highest points task
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      const task = sortedTasks[i];
      
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

      // Get the time slots for this task
      const timeSlots = task.timeSlots.length > 0 ? task.timeSlots : [{
        id: null,
        startTime: "00:00",
        endTime: "23:59",
        points: task.totalPoints
      }];

      // Create new assignments based on task frequency
      if (task.executionFrequency === 'DAILY') {
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
                verified: null, // Important: null = pending verification
                ...(timeSlot.id ? { timeSlotId: timeSlot.id } : {})
              }
            });
          }
        }
      } else if (task.executionFrequency === 'WEEKLY') {
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
          selectedDays = ['MONDAY'];
        }
        
        for (const day of selectedDays) {
          const baseDueDate = TaskHelpers.calculateDueDate(day, weekStart);
          
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
                verified: null, // Important: null = pending verification
                ...(timeSlot.id ? { timeSlotId: timeSlot.id } : {})
              }
            });
          }
        }
      }

      // ✅ REMOVED: Points are NOT added here anymore!
      // Points will be added when admin VERIFIES the submission

      rotatedTasks.push({
        taskId: task.id,
        taskTitle: task.title,
        taskPoints: task.totalPoints,
        previousAssignee: task.currentAssignee,
        newAssignee: member.userId,
        newAssigneeName: member.user?.fullName || 'Unknown'
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
      rotatedTasks,
      newWeek,
      weekStart,
      weekEnd,
      note: "Points will be awarded only after admin verification"
    };

  } catch (error: any) {
    console.error("TaskService.rotateGroupTasks error:", error);
    return { success: false, message: error.message || "Error rotating tasks" };
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


// In task.services.ts - UPDATED reassignTask with creation-date-based week boundaries

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

    // Check if target user is an active member AND in rotation
    const targetMember = task.group.members.find(m => 
      m.userId === targetUserId && 
      m.isActive && 
      m.inRotation
    );
    
    if (!targetMember) {
      return { success: false, message: "Target user is not an active member in rotation" };
    }

    // Get all active members that are in rotation
    const allActiveMembers = task.group.members
      .filter(m => m.isActive && m.inRotation)
      .map(m => ({
        userId: m.userId,
        fullName: m.user.fullName,
        avatarUrl: m.user.avatarUrl,
        rotationOrder: m.rotationOrder,
        groupRole: m.groupRole
      }));

    // Update task's rotationMembers
    await prisma.task.update({
      where: { id: taskId },
      data: {
        rotationMembers: allActiveMembers as any
      }
    });

    // Delete existing assignments for current week
    await prisma.assignment.deleteMany({
      where: { 
        taskId, 
        rotationWeek: task.group.currentRotationWeek 
      }
    });

    // Get UTC today at midnight
    const now = new Date();
    const todayUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0, 0
    ));
    
    // ✅ OPTION 2: Use creation date as week start
    const creationDateUTC = new Date(todayUTC);
    const weekStartUTC = new Date(creationDateUTC);
    const weekEndUTC = new Date(weekStartUTC);
    weekEndUTC.setUTCDate(weekStartUTC.getUTCDate() + 6);
    weekEndUTC.setUTCHours(23, 59, 59, 999);
    
    console.log(`📅 Using creation-date-based week boundaries:`);
    console.log(`   Week start (UTC): ${weekStartUTC.toISOString()}`);
    console.log(`   Week end (UTC): ${weekEndUTC.toISOString()}`);
    
    // Map UTC day index to day name
    const dayNames: Record<number, DayOfWeek> = {
      0: 'SUNDAY',
      1: 'MONDAY',
      2: 'TUESDAY',
      3: 'WEDNESDAY',
      4: 'THURSDAY',
      5: 'FRIDAY',
      6: 'SATURDAY'
    };
    
    console.log(`🔄 [REASSIGN] Creating assignments for ${targetMember.user?.fullName}`);
    console.log(`   Today UTC: ${todayUTC.toISOString()}`);
    console.log(`   Today UTC day index: ${todayUTC.getUTCDay()}`);
    
    // Create new assignments for target user using UTC
    if (task.executionFrequency === 'DAILY') {
      console.log(`   Creating DAILY assignments for next 7 days:`);
      
      for (let i = 0; i < 7; i++) {
        // Create due date in UTC
        const dueDateUTC = new Date(todayUTC);
        dueDateUTC.setUTCDate(todayUTC.getUTCDate() + i);
        
        // Get the actual UTC day name
        const utcDayIndex = dueDateUTC.getUTCDay();
        const actualDayName = dayNames[utcDayIndex];
        
        console.log(`      Day ${i}: ${actualDayName} (${dueDateUTC.toISOString()})`);
        
        for (const timeSlot of task.timeSlots) {
          const timeParts = timeSlot.startTime.split(':');
          const hours = Number(timeParts[0]) || 18;
          const minutes = Number(timeParts[1]) || 0;
          
          const slotDueDateUTC = new Date(dueDateUTC);
          slotDueDateUTC.setUTCHours(hours, minutes, 0, 0);
          
          const assignmentPoints = timeSlot.points !== null ? timeSlot.points : 0;

          await prisma.assignment.create({
            data: {
              taskId,
              userId: targetUserId,
              dueDate: slotDueDateUTC,
              points: assignmentPoints,
              rotationWeek: task.group.currentRotationWeek,
              weekStart: weekStartUTC,
              weekEnd: weekEndUTC,
              assignmentDay: actualDayName,
              completed: false,
              timeSlotId: timeSlot.id
            }
          });
          console.log(`         ✅ Created: ${actualDayName} at ${timeSlot.startTime}-${timeSlot.endTime}`);
        }
      }
    }  
    else if (task.executionFrequency === 'WEEKLY') {
  // Get selected days - FIXED type handling
  let selectedDays: DayOfWeek[] = [];

  if (task.selectedDays) {
    try {
      // Handle different possible formats
      if (typeof task.selectedDays === 'string') {
        // Parse string JSON
        selectedDays = JSON.parse(task.selectedDays);
      } else if (Array.isArray(task.selectedDays)) {
        // Already an array, convert each item to DayOfWeek
        selectedDays = task.selectedDays.map(day => day as DayOfWeek);
      } else {
        // Try to stringify and parse
        selectedDays = JSON.parse(JSON.stringify(task.selectedDays));
      }
    } catch (error) {
      console.error('Error parsing selectedDays:', error);
      selectedDays = [];
    }
  }

  console.log(`📋 Task.selectedDays RAW:`, task.selectedDays);
  console.log(`📋 Task.selectedDays type:`, typeof task.selectedDays);
  console.log(`📋 Task.selectedDays parsed:`, selectedDays);
  console.log(`📋 Task.selectedDays length:`, selectedDays.length);
  
  if (selectedDays.length === 0 && task.dayOfWeek) {
    selectedDays = [task.dayOfWeek];
  }
  
  if (selectedDays.length === 0) {
    selectedDays = ['MONDAY'];
  }
  
  console.log(`   Creating WEEKLY assignments for days: ${selectedDays.join(', ')}`);
  
  // Map day names to UTC day indices
  const dayToIndex: Record<string, number> = {
    'SUNDAY': 0,
    'MONDAY': 1,
    'TUESDAY': 2,
    'WEDNESDAY': 3,
    'THURSDAY': 4,
    'FRIDAY': 5,
    'SATURDAY': 6
  };
  
  // Get creation day index
  const creationDayIndex = creationDateUTC.getUTCDay();
  
  // Filter valid days
  const validDays = selectedDays.filter(day => dayToIndex[day as string] !== undefined);
  
  // Sort selected days in order starting from creation day
  const daysInOrder = [...validDays].sort((a, b) => {
    const indexA = dayToIndex[a as string];
    const indexB = dayToIndex[b as string];
    
    if (indexA === undefined || indexB === undefined) return 0;
    
    let relativeA = indexA < creationDayIndex ? indexA + 7 : indexA;
    let relativeB = indexB < creationDayIndex ? indexB + 7 : indexB;
    
    return relativeA - relativeB;
  });
  
  console.log(`   Creation day index: ${creationDayIndex}`);
  console.log(`   Days in rotation order: ${daysInOrder.join(' → ')}`);
  // In reassignTask - WEEKLY section
for (let i = 0; i < daysInOrder.length; i++) {
  const day = daysInOrder[i];
  const targetDayIndex = dayToIndex[day as string];
  
  if (targetDayIndex === undefined) {
    console.warn(`⚠️ Unknown day: ${day}, skipping`);
    continue;
  }
  
  let daysToAdd = targetDayIndex - creationDayIndex;
  if (daysToAdd < 0) daysToAdd += 7;
  
  const dueDateUTC = new Date(creationDateUTC);
  dueDateUTC.setUTCDate(creationDateUTC.getUTCDate() + daysToAdd);
  dueDateUTC.setUTCHours(0, 0, 0, 0);
  
  // ✅ FIX: Calculate the actual day name from the due date
  const actualDayName = dayNames[dueDateUTC.getUTCDay()];  // ← Use this instead of day
  
  const isInPast = dueDateUTC < todayUTC;
  
  console.log(`      Day ${i+1}: ${day} (actual: ${actualDayName}) → ${dueDateUTC.toISOString()} (days to add: ${daysToAdd}) ${isInPast ? '⚠️ EXPIRED' : '✅ ACTIVE'}`);
  
  for (const timeSlot of task.timeSlots) {
    const timeParts = timeSlot.startTime.split(':');
    const hours = Number(timeParts[0]) || 18;
    const minutes = Number(timeParts[1]) || 0;
    
    const slotDueDateUTC = new Date(dueDateUTC);
    slotDueDateUTC.setUTCHours(hours, minutes, 0, 0);
    
    const assignmentPoints = timeSlot.points !== null ? timeSlot.points : 0;

    await prisma.assignment.create({
      data: {
        taskId,
        userId: targetUserId,
        dueDate: slotDueDateUTC,
        points: assignmentPoints,
        rotationWeek: task.group.currentRotationWeek,
        weekStart: weekStartUTC,
        weekEnd: weekEndUTC,
        assignmentDay: actualDayName,  // ✅ Use actual day name from due date
        completed: false,
        expired: isInPast ? true : false,
        expiredAt: isInPast ? new Date() : undefined,
        missedTimeSlotIds: isInPast ? [timeSlot.id] : [],
        timeSlotId: timeSlot.id
      }
    });
    console.log(`         ✅ Created: ${actualDayName} at ${timeSlot.startTime}-${timeSlot.endTime} (${assignmentPoints} pts) ${isInPast ? '⚠️ EXPIRED' : '✅ ACTIVE'}`);
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

    // 🔴 EMIT SOCKET EVENT
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

 // Delete a task - HARD DELETE with history preservation
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
        },
        timeSlots: true
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

    // ===== HARD DELETE WITH HISTORY PRESERVATION =====
    
    // STEP 1: Store task info on all assignments before deletion
    if (task.assignments && task.assignments.length > 0) {
      await prisma.$executeRaw`
        UPDATE assignments 
        SET taskTitle = ${task.title},
            taskPoints = ${task.points},
            taskCategory = ${task.category},
            taskId = NULL
        WHERE taskId = ${task.id}
      `;
      
      console.log(`✅ Preserved ${task.assignments.length} assignments with task history`);
    }

    // STEP 2: Delete swap requests associated with this task's assignments
    const assignmentIds = task.assignments?.map(a => a.id) || [];
    
    if (assignmentIds.length > 0) {
      await prisma.swapRequest.deleteMany({
        where: { assignmentId: { in: assignmentIds } }
      });
      console.log(`✅ Deleted swap requests for ${assignmentIds.length} assignments`);
    }

    // STEP 3: Delete time slots
    if (task.timeSlots && task.timeSlots.length > 0) {
      await prisma.timeSlot.deleteMany({
        where: { taskId: task.id }
      });
      console.log(`✅ Deleted ${task.timeSlots.length} time slots`);
    }

    // STEP 4: HARD DELETE the task
    await prisma.task.delete({
      where: { id: taskId }
    });
    console.log(`✅ Hard deleted task: ${task.title}`);

    // STEP 5: Create notifications for affected users
    const affectedUserIds = new Set<string>();
    task.assignments?.forEach(assignment => {
      affectedUserIds.add(assignment.userId);
    });

    for (const affectedUserId of affectedUserIds) {
      await prisma.userNotification.create({
        data: {
          userId: affectedUserId,
          type: "TASK_DELETED",
          title: "🗑️ Task Deleted",
          message: `The task "${task.title}" has been permanently deleted by an admin. Your history and points are preserved.`,
          data: {
            taskId: task.id,
            taskTitle: task.title,
            groupId: task.groupId,
            groupName: task.group.name,
            preservedAssignments: task.assignments?.length || 0
          }
        }
      });
    }

    // 🔴 EMIT SOCKET EVENT
    await SocketService.emitTaskDeleted(taskId, task.title, task.groupId, userId);

    return { 
      success: true, 
      message: `Task permanently deleted. ${task.assignments?.length || 0} historical assignments preserved.`,
      preservedAssignments: task.assignments?.length || 0,
      deletedTask: {
        id: task.id,
        title: task.title,
        groupId: task.groupId
      }
    };

  } catch (error: any) {
    console.error("TaskService.deleteTask error:", error);
    
    // Don't try to log to adminAuditLog - just return error
    return { 
      success: false, 
      message: error.message || "Error deleting task" 
    };
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