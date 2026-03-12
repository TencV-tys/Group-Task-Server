// cron/reminderCron.ts - FIXED VERSION
import cron from 'node-cron';
import prisma from '../prisma';
import { AssignmentService } from '../services/assignment.services';
import { UserNotificationService } from '../services/user.notification.services';

// ========== SEND DAILY TASK REMINDERS ==========
const sendDailyTaskReminders = async () => {
  try {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log(`📅 Sending daily task reminders for ${today.toDateString()}`);

    // Get all assignments due today that aren't completed
    const todaysAssignments = await prisma.assignment.findMany({
      where: {
        completed: false,
        dueDate: {
          gte: today,
          lt: tomorrow
        }
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true
          }
        },
        task: {
          select: {
            id: true,
            title: true,
            points: true,
            executionFrequency: true
          }
        },
        timeSlot: true
      }
    });

    // Filter out assignments with null tasks
    const validAssignments = todaysAssignments.filter(a => a.task !== null);

    // Group by user
    const userTasks: Record<string, any> = {};
    
    validAssignments.forEach(assignment => {
      if (!userTasks[assignment.userId]) {
        userTasks[assignment.userId] = {
          userId: assignment.userId,
          userName: assignment.user?.fullName || 'User',
          tasks: []
        };
      }
      
      // Format time slot info
      let timeInfo = '';
      if (assignment.timeSlot) {
        timeInfo = `${assignment.timeSlot.startTime} - ${assignment.timeSlot.endTime}`;
        if (assignment.timeSlot.label) {
          timeInfo += ` (${assignment.timeSlot.label})`;
        }
      }
      
      userTasks[assignment.userId].tasks.push({
        taskId: assignment.task!.id,
        title: assignment.task!.title,
        timeSlot: timeInfo,
        points: assignment.points,
        startTime: assignment.timeSlot?.startTime || 'Scheduled',
        endTime: assignment.timeSlot?.endTime || '',
        label: assignment.timeSlot?.label
      });
    });

    // Send one notification per user with all their tasks
    let remindersSent = 0;
    
    for (const userId in userTasks) {
      const userData = userTasks[userId];
      const taskCount = userData.tasks.length;
      
      // Create a nice summary message
      let message = '';
      if (taskCount === 1) {
        const task = userData.tasks[0];
        message = `You have 1 task today: "${task.title}"`;
        if (task.timeSlot) {
          message += ` at ${task.timeSlot}`;
        }
      } else {
        message = `You have ${taskCount} tasks today:\n`;
        userData.tasks.forEach((task: any, index: number) => {
          message += `${index + 1}. "${task.title}"`;
          if (task.timeSlot) {
            message += ` (${task.timeSlot})`;
          }
          message += '\n';
        });
      }

      // Check if we already sent a reminder today (prevent spam)
      const existingReminder = await prisma.userNotification.findFirst({
        where: {
          userId: userData.userId,
          type: "DAILY_TASK_REMINDER",
          createdAt: {
            gte: today
          }
        }
      });

      if (!existingReminder) {
        await UserNotificationService.createNotification({
          userId: userData.userId,
          type: "DAILY_TASK_REMINDER",
          title: `📅 ${taskCount} Task${taskCount > 1 ? 's' : ''} Due Today`,
          message: message,
          data: {
            date: today.toISOString(),
            taskCount,
            tasks: userData.tasks.map((t: any) => ({
              taskId: t.taskId,
              title: t.title,
              timeSlot: t.timeSlot,
              startTime: t.startTime,
              endTime: t.endTime,
              label: t.label,
              points: t.points
            }))
          }
        });
        remindersSent++;
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
  
  // 1️⃣ RUN EVERY MINUTE - Upcoming task reminders (30 min before, during window)
  cron.schedule('* * * * *', async () => {
    console.log('🔔 Running task reminder check at:', new Date().toISOString());
    
    try { 
      const startTime = Date.now();
      const result = await AssignmentService.sendUpcomingTaskReminders();
      const endTime = Date.now();
      
      if (result.success) {
        if (result.remindersSent > 0) {
          console.log(`✅ Sent ${result.remindersSent} task reminders in ${endTime - startTime}ms`);
        }
      } else {
        console.log(`❌ Reminder error: ${result.message}`);
      }
      
    } catch (error) {
      console.error('❌ Error in reminder cron job:', error);
    }
  });

  // 2️⃣ RUN AT 7:00 AM - Early morning daily summary
  cron.schedule('0 7 * * *', async () => {
    console.log('🌅 Running morning daily task reminder at:', new Date().toISOString());
    await sendDailyTaskReminders();
  });

  // 3️⃣ RUN AT 12:00 PM - Noon reminder for late risers
  cron.schedule('0 12 * * *', async () => {
    console.log('☀️ Running afternoon daily task reminder at:', new Date().toISOString());
    await sendDailyTaskReminders();
  });

  // 4️⃣ RUN AT 4:00 PM - Afternoon reminder before evening tasks
  cron.schedule('0 16 * * *', async () => {
    console.log('🌆 Running evening daily task reminder at:', new Date().toISOString());
    await sendDailyTaskReminders();
  });
  
  console.log('🔔 Task reminder cron initialized:');
  console.log('   ├─ Every minute: Upcoming task alerts');
  console.log('   ├─ 7:00 AM: Morning daily summary');
  console.log('   ├─ 12:00 PM: Noon reminder');
  console.log('   └─ 4:00 PM: Evening reminder');
};