// utils/devRotation.ts - COMPLETE FIXED VERSION WITH CONSISTENT END TIME
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
  //await updateExpiredAssignments();
  
  // ========== 4. OLD NOTIFICATIONS ==========
  await cleanupOldNotifications();
  
  // ========== 5. MARK MISSED TIME SLOTS (MULTI-SLOT NEGLECT) ==========
  //await markMissedTimeSlots();
  
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

async function updateExpiredAssignments() {
  console.log('\n📋 Updating expired assignments (whole task neglect)...');
  
  const now = new Date();
  const todayUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  
  const potentialExpiredAssignments = await prisma.assignment.findMany({
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
      user: true,
      timeSlot: true
    }
  });

  if (potentialExpiredAssignments.length === 0) {
    console.log('   ✅ No potential expired assignments found');
    return;
  }

  console.log(`   ⚠️ Found ${potentialExpiredAssignments.length} potential expired assignments`);

  let totalPointsLost = 0;
  let actualExpiredCount = 0;

  for (const assignment of potentialExpiredAssignments) {
    if (!assignment.task) {
      console.log(`   ⏭️ Skipping assignment ${assignment.id} - task deleted`);
      continue;
    }
    
    const isMultiSlot = assignment.task.timeSlots && assignment.task.timeSlots.length > 1;
    const completedSlotIds: string[] = (assignment as any).completedTimeSlotIds || [];
    const missedSlotIds: string[] = (assignment as any).missedTimeSlotIds || [];
    
    if (isMultiSlot) {
      const totalSlots = assignment.task.timeSlots.length;
      const accountedSlots = completedSlotIds.length + missedSlotIds.length;
      
      if (accountedSlots < totalSlots) {
        console.log(`   ⏭️ Skipping full expiry for ${assignment.id} - ${accountedSlots}/${totalSlots} slots accounted (still pending)`);
        continue;
      }
      
      if (completedSlotIds.length > 0) {
        console.log(`   ⏭️ Skipping full expiry for ${assignment.id} - ${completedSlotIds.length} slots completed, not fully expired`);
        continue;
      }
    }
    
    let gracePeriodEnd: Date;
    
    if (assignment.timeSlot) {
      const [endHourRaw, endMinRaw] = assignment.timeSlot.endTime.split(':');
      let endHour = parseInt(endHourRaw || '0', 10);
      const endMin = parseInt(endMinRaw || '0', 10);
      
      endHour = endHour - 8;
      if (endHour < 0) endHour += 24;
      
      const endTimeUTC = new Date(assignment.dueDate);
      endTimeUTC.setUTCHours(endHour, endMin, 0, 0);
      
      gracePeriodEnd = new Date(endTimeUTC.getTime() + 30 * 60000);
      
      console.log(`   📅 Assignment ${assignment.id}:`);
      console.log(`      Grace period ends: ${gracePeriodEnd.toISOString()}`);
      console.log(`      Current time: ${now.toISOString()}`);
      
    } else {
      const endOfDayUTC = new Date(assignment.dueDate);
      endOfDayUTC.setUTCHours(23, 59, 59, 999);
      gracePeriodEnd = new Date(endOfDayUTC.getTime() + 30 * 60000);
      
      console.log(`   📅 Assignment ${assignment.id} (no time slot):`);
      console.log(`      Grace period ends: ${gracePeriodEnd.toISOString()}`);
      console.log(`      Current time: ${now.toISOString()}`);
    }
    
    if (now <= gracePeriodEnd) {
      const timeRemaining = Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / 1000);
      console.log(`   ⏰ Assignment ${assignment.id} STILL IN GRACE PERIOD (${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s remaining)`);
      continue;
    }
    
    console.log(`   ❌ Assignment ${assignment.id} IS EXPIRED (grace period ended at ${gracePeriodEnd.toISOString()})`);
    
    actualExpiredCount++;
    
    let pointsLost = assignment.points || 0;
    
    if (isMultiSlot && completedSlotIds.length > 0) {
      const totalSlotPoints = assignment.task.timeSlots.reduce((sum, slot) => sum + (slot.points || 0), 0);
      const completedPoints = assignment.task.timeSlots
        .filter(slot => completedSlotIds.includes(slot.id))
        .reduce((sum, slot) => sum + (slot.points || 0), 0);
      pointsLost = totalSlotPoints - completedPoints;
    }
    
    // ✅ GET CURRENT USER POINTS
    const currentMember = await prisma.groupMember.findFirst({
      where: { userId: assignment.userId, groupId: assignment.task.groupId, isActive: true },
      select: { cumulativePoints: true }
    });
    const currentPoints = currentMember?.cumulativePoints || 0;
    
    // ✅ PREVENT NEGATIVE POINTS
    const actualDeduction = Math.min(pointsLost, currentPoints);
    totalPointsLost += actualDeduction;
    
    if (actualDeduction > 0 && assignment.task.groupId) {
      await prisma.groupMember.updateMany({
        where: {
          userId: assignment.userId,
          groupId: assignment.task.groupId,
          isActive: true
        },
        data: {
          cumulativePoints: {
            decrement: actualDeduction
          },
          pointsUpdatedAt: new Date()
        }
      });
      console.log(`   💰 Deducted ${actualDeduction} points from user ${assignment.userId} (had ${currentPoints} pts)`);
    } else {
      console.log(`   💰 No deduction - user ${assignment.userId} has 0 points`);
    }
    
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        expired: true,
        expiredAt: now,
        notes: `[EXPIRED: Past grace period on ${gracePeriodEnd.toISOString().split('T')[0]}] ${assignment.notes || ''}`
      }
    });

    const admins = await prisma.groupMember.findMany({
      where: {
        groupId: assignment.task.groupId,
        groupRole: "ADMIN",
        isActive: true
      },
      include: {
        user: { select: { fullName: true } }
      }
    });

    await UserNotificationService.createNotification({
      userId: assignment.userId,
      type: "TASK_EXPIRED",
      title: "⚠️ Task Expired",
      message: actualDeduction > 0
        ? (isMultiSlot && completedSlotIds.length > 0
          ? `"${assignment.task.title}" had uncompleted time slots that have expired. You lost ${actualDeduction} points.`
          : `"${assignment.task.title}" was not completed within the 30-minute grace period and has expired. You lost ${actualDeduction} points.`)
        : `"${assignment.task.title}" expired. You had 0 points, so no points were deducted. Keep completing tasks to earn points!`,
      data: {
        assignmentId: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task.title,
        dueDate: assignment.dueDate,
        gracePeriodEnd: gracePeriodEnd.toISOString(),
        expiredAt: now,
        pointsLost: actualDeduction,
        isMultiSlot,
        completedSlots: completedSlotIds.length,
        totalSlots: assignment.task.timeSlots?.length || 1
      }
    });

    for (const admin of admins) {
      await UserNotificationService.createNotification({
        userId: admin.userId,
        type: "NEGLECT_DETECTED",
        title: "⚠️ Task Expired",
        message: `${assignment.user?.fullName || 'Unknown'} missed "${assignment.task.title}" - ${actualDeduction} points deducted${actualDeduction === 0 ? ' (user had 0 points)' : ''}`,
        data: {
          assignmentId: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task.title,
          userId: assignment.userId,
          userName: assignment.user?.fullName || 'Unknown',
          pointsLost: actualDeduction,
          dueDate: assignment.dueDate,
          gracePeriodEnd: gracePeriodEnd.toISOString(),
          detectedAt: now
        }
      });
    }

    console.log(`   ✅ Expired assignment: ${assignment.id} (${assignment.task.title}) - Lost ${actualDeduction} points`);
  }
  
  console.log(`✅ Assignments updated: ${actualExpiredCount} expired, total points lost: ${totalPointsLost}`);
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

async function markMissedTimeSlots() {
  console.log('\n⚠️ Marking missed time slots for multi-slot tasks...');
  
  const now = new Date();
  const todayUTC = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  
  const activeAssignments = await prisma.assignment.findMany({
    where: {
      completed: false,
      expired: false,
      photoUrl: null,
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
    
    const dueDateUTC = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
    const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    
    if (dueDateUTC > todayUTC) continue;
    
    const newlyMissedSlots: any[] = [];
    
    for (const timeSlot of timeSlots) {
      if (completedSlotIds.includes(timeSlot.id)) continue;
      if (missedSlotIds.includes(timeSlot.id)) continue;
      
      const endParts = timeSlot.endTime.split(':');
      let endHour = parseInt(endParts[0] || '0', 10);
      const endMinute = parseInt(endParts[1] || '0', 10);
      
      endHour = endHour - 8;
      if (endHour < 0) endHour += 24;
      
      const slotEndTime = new Date(dueDate);
      slotEndTime.setUTCHours(endHour, endMinute, 0, 0);
      
      const gracePeriodEnd = new Date(slotEndTime.getTime() + 30 * 60000);
      
      if (now > gracePeriodEnd) {
        newlyMissedSlots.push({
          ...timeSlot,
          pointsLost: timeSlot.points || 0
        });
      }
    }
    
    if (newlyMissedSlots.length > 0) {
      const alreadyProcessed = newlyMissedSlots.every(slot => missedSlotIds.includes(slot.id));
      
      if (alreadyProcessed) {
        console.log(`   ⏭️ Skipping assignment ${assignment.id} - slots already marked as missed`);
        continue;
      }
      
      const trulyNewSlots = newlyMissedSlots.filter(slot => !missedSlotIds.includes(slot.id));
      
      if (trulyNewSlots.length === 0) {
        console.log(`   ⏭️ Skipping assignment ${assignment.id} - no truly new missed slots`);
        continue;
      }
      
      // ✅ GET CURRENT USER POINTS
      const currentMember = await prisma.groupMember.findFirst({
        where: { userId: assignment.userId, groupId: assignment.task!.groupId, isActive: true },
        select: { cumulativePoints: true }
      });
      let currentPoints = currentMember?.cumulativePoints || 0;
      
      const newMissedSlotIds = [...missedSlotIds, ...trulyNewSlots.map(s => s.id)];
      const allSlotsAccounted = (completedSlotIds.length + newMissedSlotIds.length) === timeSlots.length;
      
      const remainingPoints = timeSlots
        .filter(slot => !newMissedSlotIds.includes(slot.id) && !completedSlotIds.includes(slot.id))
        .reduce((sum, slot) => sum + (slot.points || 0), 0);
      
      const pointsLostThisBatch = trulyNewSlots.reduce((sum, slot) => sum + (slot.pointsLost || 0), 0);
      
      // ✅ PREVENT NEGATIVE POINTS
      const actualDeduction = Math.min(pointsLostThisBatch, currentPoints);
      totalPointsLost += actualDeduction;
      totalMissedSlots += trulyNewSlots.length;
      
      if (actualDeduction > 0) {
        await prisma.groupMember.updateMany({
          where: {
            userId: assignment.userId,
            groupId: assignment.task!.groupId,
            isActive: true
          },
          data: {
            cumulativePoints: {
              decrement: actualDeduction
            },
            pointsUpdatedAt: new Date()
          }
        });
        currentPoints -= actualDeduction;
        console.log(`💰💰💰 [POINTS DEDUCTED] User ${assignment.userId} lost -${actualDeduction} points for missing ${trulyNewSlots.length} new slot(s) (now has ${currentPoints} pts)`);
      } else {
        console.log(`💰💰💰 [POINTS SKIPPED] User ${assignment.userId} has 0 points, no deduction for missing ${trulyNewSlots.length} slot(s)`);
      }
      
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: {
          missedTimeSlotIds: newMissedSlotIds,
          points: remainingPoints,
          partiallyExpired: newMissedSlotIds.length > 0 && !allSlotsAccounted,
          expired: allSlotsAccounted && completedSlotIds.length === 0,
          expiredAt: allSlotsAccounted && completedSlotIds.length === 0 ? now : undefined,
          notes: assignment.notes 
            ? `${assignment.notes}\n[MISSED SLOTS: ${trulyNewSlots.map(s => `${s.startTime}-${s.endTime}`).join(', ')}]`
            : `[MISSED SLOTS: ${trulyNewSlots.map(s => `${s.startTime}-${s.endTime}`).join(', ')}]`
        } as any
      });
      
      console.log(`   ✅ Assignment ${assignment.id}: Missed ${trulyNewSlots.length} new slot(s) - Lost ${actualDeduction} points`);
      
      const admins = await prisma.groupMember.findMany({
        where: {
          groupId: assignment.task!.groupId,
          groupRole: "ADMIN",
          isActive: true
        },
        include: {
          user: { select: { fullName: true } }
        }
      });
      
      for (const slot of trulyNewSlots) {
        const slotPointsValue = Math.min(slot.pointsLost || 0, currentPoints + (slot.pointsLost || 0));
        
        await UserNotificationService.createNotification({
          userId: assignment.userId,
          type: "SLOT_MISSED",
          title: "⏰ Time Slot Missed",
          message: slotPointsValue > 0
            ? `You missed the ${slot.startTime}-${slot.endTime}${slot.label ? ` (${slot.label})` : ''} slot for "${assignment.task!.title}". Lost ${slotPointsValue} points.`
            : `You missed the ${slot.startTime}-${slot.endTime}${slot.label ? ` (${slot.label})` : ''} slot for "${assignment.task!.title}". You had 0 points, so no points were deducted.`,
          data: {
            assignmentId: assignment.id,
            taskId: assignment.taskId,
            taskTitle: assignment.task!.title,
            slotId: slot.id,
            slotTime: `${slot.startTime}-${slot.endTime}`,
            slotLabel: slot.label || '',
            pointsLost: slotPointsValue,
            remainingPoints,
            completedSlots: completedSlotIds.length,
            missedSlots: newMissedSlotIds.length,
            totalSlots: timeSlots.length,
            dueDate: assignment.dueDate,
            detectedAt: now
          }
        });
        
        for (const admin of admins) {
          await UserNotificationService.createNotification({
            userId: admin.userId,
            type: "NEGLECT_DETECTED",
            title: "⚠️ Time Slot Missed",
            message: `${assignment.user?.fullName || 'Unknown'} missed the ${slot.startTime}-${slot.endTime} slot for "${assignment.task!.title}" - ${slotPointsValue} points deducted${slotPointsValue === 0 ? ' (user had 0 points)' : ''}`,
            data: {
              assignmentId: assignment.id,
              taskId: assignment.taskId,
              taskTitle: assignment.task!.title,
              userId: assignment.userId,
              userName: assignment.user?.fullName || 'Unknown',
              slotId: slot.id,
              slotTime: `${slot.startTime}-${slot.endTime}`,
              slotLabel: slot.label || '',
              pointsLost: slotPointsValue,
              dueDate: assignment.dueDate,
              detectedAt: now
            }
          });
        }
      } 
    } 
  } 
  
  console.log(`✅ Missed time slots marked: ${totalMissedSlots} new slots missed, total points lost: ${totalPointsLost}`);
}