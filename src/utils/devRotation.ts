// utils/devRotation.ts - COMPLETE VERSION WITH ALL UPDATES
import prisma from '../prisma';
import { TaskService } from '../services/task.services';
import { UserNotificationService } from '../services/user.notification.services';
import { SwapRequestService } from '../services/swapRequest.services';

export async function checkAndFixRotation() {
  console.log('🔄 Checking all time-based data for updates...');
  console.log(`📅 Current time: ${new Date().toISOString()}`);
  
  // ========== 1. ROTATION ==========
  await updateRotation();
  
  // ========== 2. SWAP REQUESTS ==========
  await updateSwapRequests();
  
  // ========== 3. EXPIRED ASSIGNMENTS ==========
  await updateExpiredAssignments();
  
  // ========== 4. OLD NOTIFICATIONS ==========
  await cleanupOldNotifications();
  
  console.log('✅ All time-based data updated to current time');
}

// ========== UPDATE ROTATION ==========
async function updateRotation() {
  console.log('\n📋 Updating rotation...');
  
  const groups = await prisma.group.findMany({
    include: {
      tasks: {
        where: { isRecurring: true },
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
  
  // Find all pending swap requests that have expired
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
    // Mark as expired
    await prisma.swapRequest.update({
      where: { id: request.id },
      data: { status: "EXPIRED" }
    });

    // Notify requester
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

    // Notify target user if exists
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

// ========== UPDATE EXPIRED ASSIGNMENTS ==========
async function updateExpiredAssignments() {
  console.log('\n📋 Updating expired assignments...');
  
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Find assignments that are past due and not yet marked as expired
  const expiredAssignments = await prisma.assignment.findMany({
    where: {
      completed: false,
      expired: false,
      dueDate: {
        lt: now  // Due date is in the past
      }
    },
    include: {
      task: true,
      user: true
    }
  });

  if (expiredAssignments.length === 0) {
    console.log('   ✅ No expired assignments found');
    return;
  }

  console.log(`   ⚠️ Found ${expiredAssignments.length} expired assignments`);

  for (const assignment of expiredAssignments) {
    // Mark as expired
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        expired: true,
        expiredAt: now,
        notes: `[EXPIRED: Past due on ${assignment.dueDate.toLocaleDateString()}] ${assignment.notes || ''}`
      }
    });

    // Notify user
    await UserNotificationService.createNotification({
      userId: assignment.userId,
      type: "TASK_EXPIRED",
      title: "⚠️ Task Expired",
      message: `"${assignment.task?.title || 'Task'}" was not completed on time and has expired. No points awarded.`,
      data: {
        assignmentId: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task?.title,
        dueDate: assignment.dueDate,
        expiredAt: now
      }
    });

    console.log(`   ✅ Expired assignment: ${assignment.id}`);
  }
  
  console.log(`✅ Assignments updated: ${expiredAssignments.length} expired`);
}

// ========== CLEANUP OLD NOTIFICATIONS ==========
async function cleanupOldNotifications() {
  console.log('\n📋 Cleaning up old notifications...');
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Delete notifications older than 30 days
  const deleted = await prisma.userNotification.deleteMany({
    where: {
      createdAt: {
        lt: thirtyDaysAgo
      }
    }
  });

  console.log(`   ✅ Deleted ${deleted.count} old notifications (older than 30 days)`);
}