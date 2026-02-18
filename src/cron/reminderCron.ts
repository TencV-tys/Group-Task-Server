// cron/reminderCron.ts - OPTIONAL
import cron from 'node-cron';
import prisma from '../prisma';

// This is OPTIONAL - only if you want server-sent reminders
export const initReminderCron = () => {
  // Check every hour for tasks due in the next hour
  cron.schedule('0 * * * *', async () => {
    console.log('Checking for upcoming deadlines...');
    
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    
    const upcomingAssignments = await prisma.assignment.findMany({
      where: {
        dueDate: {
          gte: now,
          lte: oneHourLater
        },
        completed: false
      },
      include: {
        user: true,
        task: {
          include: {
            group: true
          }
        }
      }
    });

    for (const assignment of upcomingAssignments) {
      // You could send push notifications here
      console.log(`Reminder: ${assignment.user.fullName} - ${assignment.task.title} due soon`);
    }
  });
}; 