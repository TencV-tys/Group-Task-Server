// utils/devRotation.ts - COMPLETE WITH BOTH TYPES OF NEGLECT DETECTION
import prisma from '../prisma';
import { TaskService } from '../services/task.services';
import { UserNotificationService } from '../services/user.notification.services';
import { SwapRequestService } from '../services/swapRequest.services';
import { TimeHelpers } from '../helpers/time.helpers';

export async function checkAndFixRotation() {
  console.log('🔄 Checking all time-based data for updates...');
  console.log(`📅 Current time: ${new Date().toISOString()}`);
  
  // ========== 1. ROTATION ==========
  await updateRotation();
  
  // ========== 2. SWAP REQUESTS ==========
  await updateSwapRequests();
  
  // ========== 3. EXPIRED ASSIGNMENTS (WHOLE TASK NEGLECTED) ==========
  await updateExpiredAssignments();
  
  // ========== 4. OLD NOTIFICATIONS ==========
  await cleanupOldNotifications();
  
  // ========== 5. MARK MISSED TIME SLOTS (MULTI-SLOT NEGLECT) ==========
  await markMissedTimeSlots();
  
  console.log('✅ All time-based data updated to current time');
}

// ========== UPDATE ROTATION ==========
async function updateRotation() {
  console.log('\n📋 Updating rotation...');
  
  const groups = await prisma.group.findMany({
    include: {
      tasks: {
        where: { isRecurring: true, isDeleted: false },
        select: { id: true, title: true, createdAt: true }
      },
      members: {
        where: { 
          isActive: true,
          inRotation: true
        },
        select: { userId: true }
      }
    }
  });

  let totalRotations = 0;

  for (const group of groups) {
    if (group.tasks.length === 0) continue;
    if (group.members.length === 0) continue;

    const sortedTasks = [...group.tasks].sort((a, b) => 
      a.createdAt.getTime() - b.createdAt.getTime()
    );
    
    const earliestTask = sortedTasks[0];
    if (!earliestTask) continue;

    const now = new Date();
    const daysSinceCreation = Math.floor(
      (now.getTime() - earliestTask.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    const expectedWeek = Math.floor(daysSinceCreation / 7) + 1;
    const currentWeek = group.currentRotationWeek;

    if (expectedWeek > currentWeek) {
      const weeksBehind = expectedWeek - currentWeek;
      console.log(`   ⚠️ Group ${group.id}: ${weeksBehind} week(s) behind (Week ${currentWeek} → ${expectedWeek})`);
      
      const admin = await prisma.groupMember.findFirst({
        where: { 
          groupId: group.id, 
          groupRole: "ADMIN",
          isActive: true
        },
        select: { userId: true }
      });

      if (!admin) {
        console.log(`   ❌ No admin found for group ${group.id}`);
        continue;
      }

      for (let i = 0; i < weeksBehind; i++) {
        const result = await TaskService.rotateGroupTasks(group.id, admin.userId);
        if (result.success) {
          totalRotations++;
          console.log(`   ✅ Rotated to week ${currentWeek + i + 1}`);
        } else {
          console.log(`   ❌ Rotation failed: ${result.message}`);
          break;
        }
      }
    }
  }
  
  console.log(`✅ Rotation complete: ${totalRotations} rotations performed`);
}

// ========== UPDATE SWAP REQUESTS ==========
async function updateSwapRequests() {
  console.log('\n📋 Updating swap requests...');
  
  const now = new Date();
  
  const expiredRequests = await prisma.swapRequest.findMany({
    where: {
      status: "PENDING",
      expiresAt: {
        lt: now
      }
    },
    include: {
      assignment: {
        include: {
          task: true
        }
      }
    }
  });

  if (expiredRequests.length === 0) {
    console.log('   ✅ No expired swap requests found');
    return;
  }

  console.log(`   ⚠️ Found ${expiredRequests.length} expired swap requests`);

  for (const request of expiredRequests) {
    await prisma.swapRequest.update({
      where: { id: request.id },
      data: { status: "EXPIRED" }
    });

    await UserNotificationService.createNotification({
      userId: request.requestedBy,
      type: "SWAP_EXPIRED",
      title: "⏰ Swap Request Expired",
      message: `Your swap request for "${request.assignment?.task?.title || 'task'}" has expired`,
      data: {
        swapRequestId: request.id,
        taskId: request.assignment?.taskId,
        taskTitle: request.assignment?.task?.title
      }
    });

    if (request.targetUserId) {
      await UserNotificationService.createNotification({
        userId: request.targetUserId,
        type: "SWAP_EXPIRED",
        title: "⏰ Swap Request Expired",
        message: `A swap request for "${request.assignment?.task?.title || 'task'}" has expired`,
        data: {
          swapRequestId: request.id,
          taskId: request.assignment?.taskId,
          taskTitle: request.assignment?.task?.title
        }
      });
    }

    console.log(`   ✅ Expired swap request: ${request.id}`);
  }
  
  console.log(`✅ Swap requests updated: ${expiredRequests.length} expired`);
}

// ========== EXPIRED ASSIGNMENTS (WHOLE TASK NEGLECTED) ==========
async function updateExpiredAssignments() {
  console.log('\n📋 Updating expired assignments (whole task neglect)...');
  
  const now = new Date();
  const todayUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  
  // Get assignments that are:
  // 1. Not completed
  // 2. Not already marked as expired
  // 3. Due date is in the past
  const expiredAssignments = await prisma.assignment.findMany({
    where: {
      completed: false,
      expired: false,
      dueDate: {
        lt: now
      }
    },
    include: {
      task: {
        include: {
          timeSlots: true
        }
      },
      user: true
    }
  });

  if (expiredAssignments.length === 0) {
    console.log('   ✅ No expired assignments found');
    return;
  }

  console.log(`   ⚠️ Found ${expiredAssignments.length} expired assignments`);

  let totalPointsLost = 0;

  for (const assignment of expiredAssignments) {
    // Calculate points lost
    let pointsLost = assignment.points || 0;
    
    // For multi-slot tasks, check if any slots were completed
    const isMultiSlot = assignment.task?.timeSlots && assignment.task.timeSlots.length > 1;
    const completedSlotIds: string[] = (assignment as any).completedTimeSlotIds || [];
    
    if (isMultiSlot && completedSlotIds.length > 0) {
      // Only count points from uncompleted slots
      const totalSlotPoints = assignment.task!.timeSlots.reduce((sum, slot) => sum + (slot.points || 0), 0);
      const completedPoints = assignment.task!.timeSlots
        .filter(slot => completedSlotIds.includes(slot.id))
        .reduce((sum, slot) => sum + (slot.points || 0), 0);
      pointsLost = totalSlotPoints - completedPoints;
    }
    
    totalPointsLost += pointsLost;
    
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        expired: true,
        expiredAt: now,
        notes: `[EXPIRED: Past due on ${assignment.dueDate.toISOString().split('T')[0]}] ${assignment.notes || ''}`
      }
    });

    // Send notification to user
    await UserNotificationService.createNotification({
      userId: assignment.userId,
      type: "TASK_EXPIRED",
      title: "⚠️ Task Expired",
      message: isMultiSlot && completedSlotIds.length > 0
        ? `"${assignment.task?.title || 'Task'}" had uncompleted time slots that have expired. You lost ${pointsLost} points.`
        : `"${assignment.task?.title || 'Task'}" was not completed on time and has expired. No points awarded.`,
      data: {
        assignmentId: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task?.title,
        dueDate: assignment.dueDate,
        expiredAt: now,
        pointsLost,
        isMultiSlot,
        completedSlots: completedSlotIds.length,
        totalSlots: assignment.task?.timeSlots?.length || 1
      }
    });

    console.log(`   ✅ Expired assignment: ${assignment.id} (${assignment.task?.title}) - Lost ${pointsLost} points`);
  }
  
  console.log(`✅ Assignments updated: ${expiredAssignments.length} expired, total points lost: ${totalPointsLost}`);
}

// ========== CLEANUP OLD NOTIFICATIONS ==========
async function cleanupOldNotifications() {
  console.log('\n📋 Cleaning up old notifications...');
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const deleted = await prisma.userNotification.deleteMany({
    where: {
      createdAt: {
        lt: thirtyDaysAgo
      }
    }
  });

  console.log(`   ✅ Deleted ${deleted.count} old notifications (older than 30 days)`);
}

// ========== MARK MISSED TIME SLOTS (MULTI-SLOT TASKS) ==========
async function markMissedTimeSlots() {
  console.log('\n⚠️ Marking missed time slots for multi-slot tasks...');
  
  const now = new Date();
  const todayUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  
  // Get all assignments that:
  // 1. Are not completed
  // 2. Not fully expired
  // 3. Have time slots (multi-slot tasks)
  const activeAssignments = await prisma.assignment.findMany({
    where: {
      completed: false,
      expired: false,
      task: {
        timeSlots: {
          some: {}
        }
      }
    },
    include: {
      task: {
        include: {
          timeSlots: {
            orderBy: { sortOrder: 'asc' }
          }
        }
      },
      user: true
    }
  });
  
  const validAssignments = activeAssignments.filter(a => a.task !== null);
  console.log(`   📊 Checking ${validAssignments.length} multi-slot assignments for missed time slots`);
  
  let totalMissedSlots = 0;
  let totalPointsLost = 0;
  
  for (const assignment of validAssignments) {
    const timeSlots = assignment.task!.timeSlots;
    if (timeSlots.length === 0) continue;
    
    const completedSlotIds: string[] = (assignment as any).completedTimeSlotIds || [];
    const missedSlotIds: string[] = (assignment as any).missedTimeSlotIds || [];
    const dueDate = new Date(assignment.dueDate);
    
    // Check if due date is today or in the past
    const dueDateUTC = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    
    // Only check if due date is today or earlier
    if (dueDateUTC > todayUTC) continue;
    
    const newlyMissedSlots: any[] = [];
    
    for (const timeSlot of timeSlots) {
      // Skip already completed or missed slots
      if (completedSlotIds.includes(timeSlot.id)) continue;
      if (missedSlotIds.includes(timeSlot.id)) continue;
      
      // Parse end time and convert to UTC (PHT is UTC+8)
      const endParts = timeSlot.endTime.split(':');
      const endHour = parseInt(endParts[0] || '0', 10);
      const endMinute = parseInt(endParts[1] || '0', 10);
      
      // Convert PHT to UTC (subtract 8 hours)
      let utcEndHour = endHour - 8;
      if (utcEndHour < 0) utcEndHour += 24;
      
      const slotEndTime = new Date(dueDate);
      slotEndTime.setUTCHours(utcEndHour, endMinute, 0, 0);
      
      // Grace period ends 30 minutes after slot end time
      const gracePeriodEnd = new Date(slotEndTime.getTime() + 30 * 60000);
      
      // If current time is past grace period, mark as missed
      if (now > gracePeriodEnd) {
        newlyMissedSlots.push({
          ...timeSlot,
          pointsLost: timeSlot.points || 0
        });
      }
    }
    
    if (newlyMissedSlots.length > 0) {
      const newMissedSlotIds = [...missedSlotIds, ...newlyMissedSlots.map(s => s.id)];
      const allSlotsAccounted = (completedSlotIds.length + newMissedSlotIds.length) === timeSlots.length;
      
      // Calculate remaining points
      const remainingPoints = timeSlots
        .filter(slot => !newMissedSlotIds.includes(slot.id) && !completedSlotIds.includes(slot.id))
        .reduce((sum, slot) => sum + (slot.points || 0), 0);
      
      const pointsLostThisBatch = newlyMissedSlots.reduce((sum, slot) => sum + (slot.pointsLost || 0), 0);
      totalPointsLost += pointsLostThisBatch;
      totalMissedSlots += newlyMissedSlots.length;
      
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: {
          missedTimeSlotIds: newMissedSlotIds,
          points: remainingPoints,
          partiallyExpired: newMissedSlotIds.length > 0 && !allSlotsAccounted,
          expired: allSlotsAccounted && completedSlotIds.length === 0,
          expiredAt: allSlotsAccounted && completedSlotIds.length === 0 ? now : undefined,
          notes: assignment.notes 
            ? `${assignment.notes}\n[MISSED SLOTS: ${newlyMissedSlots.map(s => `${s.startTime}-${s.endTime}`).join(', ')}]`
            : `[MISSED SLOTS: ${newlyMissedSlots.map(s => `${s.startTime}-${s.endTime}`).join(', ')}]`
        } as any
      });
      
      console.log(`   ✅ Assignment ${assignment.id}: Missed ${newlyMissedSlots.length} slot(s) - Lost ${pointsLostThisBatch} points`);
      
      // Send notifications for each missed slot
      for (const slot of newlyMissedSlots) {
        await UserNotificationService.createNotification({
          userId: assignment.userId,
          type: "SLOT_MISSED",
          title: "⏰ Time Slot Missed",
          message: `You missed the ${slot.startTime}-${slot.endTime}${slot.label ? ` (${slot.label})` : ''} slot for "${assignment.task!.title}". Lost ${slot.pointsLost || 0} points.`,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            taskTitle: assignment.task!.title,
            slotId: slot.id,
            slotTime: `${slot.startTime}-${slot.endTime}`,
            slotLabel: slot.label,
            pointsLost: slot.pointsLost || 0,
            remainingPoints,
            completedSlots: completedSlotIds.length,
            missedSlots: newMissedSlotIds.length,
            totalSlots: timeSlots.length,
            dueDate: assignment.dueDate,
            detectedAt: now
          }
        });
      }
    }
  }
  
  console.log(`✅ Missed time slots marked: ${totalMissedSlots} slots missed, total points lost: ${totalPointsLost}`);
}