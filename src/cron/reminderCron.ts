// cron/reminderCron.ts - UPDATED to run every 10 minutes

import cron from 'node-cron';
import prisma from '../prisma';
import { AssignmentService } from '../services/assignment.services';
import { UserNotificationService } from '../services/user.notification.services';

const sendDailyTaskReminders = async () => {
  try {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      0, 0, 0, 0
    ));
    const tomorrowUTC = new Date(todayUTC);
    tomorrowUTC.setUTCDate(todayUTC.getUTCDate() + 1);

    console.log(`📅 Sending daily task reminders for UTC date: ${todayUTC.toISOString().split('T')[0]}`);

    const todaysAssignments = await prisma.assignment.findMany({
      where: {
        completed: false,
        dueDate: { gte: todayUTC, lt: tomorrowUTC }
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        task: {
          select: {
            id: true,
            title: true,
            points: true,
            executionFrequency: true,
            groupId: true,
            group: { select: { id: true, name: true } },
            timeSlots: true
          }
        },
        timeSlot: true
      }
    });

    const validAssignments = todaysAssignments.filter(a => a.task !== null);

    // Batch-fetch all admins upfront
    const groupIds = [...new Set(validAssignments.map(a => a.task!.groupId).filter(Boolean))] as string[];
    const adminMemberships = await prisma.groupMember.findMany({
      where: { groupId: { in: groupIds }, groupRole: "ADMIN", isActive: true },
      select: { userId: true, groupId: true }
    });
    const adminUserIdsByGroup: Record<string, Set<string>> = {};
    for (const m of adminMemberships) {
      adminUserIdsByGroup[m.groupId] ??= new Set();
      adminUserIdsByGroup[m.groupId]!.add(m.userId);
    }

    const userTasks: Record<string, any> = {};

    for (const assignment of validAssignments) {
      const groupId = assignment.task!.groupId;

      if (!groupId) {
        console.log(`⚠️ No groupId for assignment ${assignment.id}, skipping`);
        continue;
      }

      const groupAdmins = adminUserIdsByGroup[groupId] || new Set();
      if (groupAdmins.has(assignment.userId)) {
        console.log(`⏭️ Skipping admin: ${assignment.user?.fullName}`);
        continue;
      }

      if (!userTasks[assignment.userId]) {
        userTasks[assignment.userId] = {
          userId: assignment.userId,
          userName: assignment.user?.fullName || 'User',
          assignments: []  // ✅ Changed from 'tasks' to 'assignments'
        };
      }

      const timeSlots = (assignment.task!.timeSlots?.length ?? 0) > 0
        ? assignment.task!.timeSlots
        : assignment.timeSlot ? [assignment.timeSlot] : [];

      const completedSlotIds: string[] = (assignment as any).completedTimeSlotIds || [];
      const missedSlotIds: string[] = (assignment as any).missedTimeSlotIds || [];

      // ✅ Count how many slots are still pending for this assignment
      let pendingSlotsCount = 0;
      const pendingSlotsList: any[] = [];

      for (const slot of timeSlots) {
        if (completedSlotIds.includes(slot.id)) continue;
        if (missedSlotIds.includes(slot.id)) continue;
        
        pendingSlotsCount++;
        pendingSlotsList.push({
          startTime: slot.startTime,
          endTime: slot.endTime,
          label: slot.label,
          points: slot.points || assignment.points
        });
      }

      // ✅ Only add assignment if it has pending slots
      if (pendingSlotsCount > 0) {
        // Build time slot description
        let timeSlotDescription = '';
        if (pendingSlotsList.length === 1) {
          const slot = pendingSlotsList[0];
          timeSlotDescription = `${slot.startTime} - ${slot.endTime}`;
          if (slot.label) timeSlotDescription += ` (${slot.label})`;
        } else {
          // Multiple slots - list them
          const slotTimes = pendingSlotsList.map(slot => slot.startTime).join(', ');
          timeSlotDescription = `${pendingSlotsCount} slots (${slotTimes})`;
        }

        userTasks[assignment.userId].assignments.push({
          taskId: assignment.task!.id,
          title: assignment.task!.title,
          timeSlotDescription,
          pendingSlotsCount,
          pendingSlots: pendingSlotsList,
          totalSlots: timeSlots.length
        });
      }
    }

    let remindersSent = 0;

    for (const userId in userTasks) {
      const userData = userTasks[userId];
      const assignmentCount = userData.assignments.length;
      if (assignmentCount === 0) continue;

      // ✅ Calculate total pending slots for the user
      const totalPendingSlots = userData.assignments.reduce(
        (sum: number, a: any) => sum + a.pendingSlotsCount, 0
      );

      let message = '';
      if (assignmentCount === 1) {
        const assignment = userData.assignments[0];
        if (assignment.pendingSlotsCount === 1) {
          message = `You have 1 pending slot today: "${assignment.title}" at ${assignment.timeSlotDescription}`;
        } else {
          message = `You have ${assignment.pendingSlotsCount} pending slots for "${assignment.title}" today (${assignment.timeSlotDescription})`;
        }
      } else {
        message = `You have ${totalPendingSlots} pending slots across ${assignmentCount} tasks today:\n`;
        userData.assignments.forEach((assignment: any, index: number) => {
          if (assignment.pendingSlotsCount === 1) {
            message += `${index + 1}. "${assignment.title}" at ${assignment.timeSlotDescription}\n`;
          } else {
            message += `${index + 1}. "${assignment.title}" - ${assignment.pendingSlotsCount} slots (${assignment.timeSlotDescription})\n`;
          }
        });
      }

      const existingReminder = await prisma.userNotification.findFirst({
        where: {
          userId: userData.userId,
          type: "DAILY_TASK_REMINDER",
          createdAt: { gte: todayUTC }
        }
      });

      if (!existingReminder) {
        await UserNotificationService.createNotification({
          userId: userData.userId,
          type: "DAILY_TASK_REMINDER",
          title: `📅 ${totalPendingSlots} Pending Slot${totalPendingSlots !== 1 ? 's' : ''} Today`,
          message,
          data: { 
            date: todayUTC.toISOString(), 
            assignmentCount,
            totalPendingSlots,
            assignments: userData.assignments 
          }
        });
        remindersSent++;
        console.log(`📢 Sent daily reminder to ${userData.userName} with ${assignmentCount} assignment(s) (${totalPendingSlots} pending slots)`);
      }
    }

    if (remindersSent > 0) {
      console.log(`✅ Sent daily task reminders to ${remindersSent} users`);
    }

    return remindersSent;
  } catch (error) {
    console.error('❌ Error sending daily task reminders:', error);
    return 0;
  }
};
 
// ========== INITIALIZE CRON JOBS ==========
export const initReminderCron = () => {
  
  // 1️⃣ RUN EVERY 10 MINUTES - Upcoming task reminders
  //    */10 means every 10 minutes (0, 10, 20, 30, 40, 50)
 
 cron.schedule('*/10 * * * *', async () => {
  console.log('🔔 Running task reminder check at:', new Date().toISOString());
  
  try { 
    const startTime = Date.now();
    const result = await AssignmentService.sendUpcomingTaskReminders();
    const endTime = Date.now();
    
    if (result.success) {
      if (result.remindersSent > 0) {
        console.log(`✅ Sent ${result.remindersSent} task reminders in ${endTime - startTime}ms`);
      } else {
        console.log(`ℹ️ No reminders needed at ${new Date().toISOString()}`);
      }
    } else {
      // ✅ Handle error without accessing result.message
      console.error(`❌ Reminder cron failed`);
    }
    
  } catch (error) {
    console.error('❌ Error in reminder cron job:', error);
  }
    
},{
  timezone: "Asia/Manila"
});

  // 2️⃣ RUN AT 7:00 AM PHT (23:00 UTC) - Early morning daily summary
  cron.schedule('0 23 * * *', async () => {
    console.log('🌅 Running morning daily task reminder at:', new Date().toISOString());
    await sendDailyTaskReminders();
  });

  // 3️⃣ RUN AT 12:00 PM PHT (04:00 UTC) - Noon reminder
  cron.schedule('0 4 * * *', async () => {
    console.log('☀️ Running afternoon daily task reminder at:', new Date().toISOString());
    await sendDailyTaskReminders();
  });

  // 4️⃣ RUN AT 4:00 PM PHT (08:00 UTC) - Afternoon/Evening reminder
  cron.schedule('0 8 * * *', async () => {
    console.log('🌆 Running evening daily task reminder at:', new Date().toISOString());
    await sendDailyTaskReminders();
  });

  // 5️⃣ RUN AT 7:00 PM PHT (11:00 UTC) - Night reminder
  cron.schedule('0 11 * * *', async () => {
    console.log('🌙 Running night daily task reminder at:', new Date().toISOString());
    await sendDailyTaskReminders();
  });
  
  console.log('🔔 Task reminder cron initialized:');
  console.log('   ├─ Every 10 minutes: Upcoming task alerts (supports multi-slot tasks, excludes admins)');
  console.log('   ├─ 7:00 AM PHT: Morning daily summary');
  console.log('   ├─ 12:00 PM PHT: Noon reminder');
  console.log('   ├─ 4:00 PM PHT: Evening reminder');
  console.log('   └─ 7:00 PM PHT: Night reminder');
};