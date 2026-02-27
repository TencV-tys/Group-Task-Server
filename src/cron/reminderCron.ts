// cron/reminderCron.ts - COMPLETE WORKING VERSION
import cron from 'node-cron';
import { AssignmentService } from '../services/assignment.services';

export const initReminderCron = () => {
  // Run every minute to check for upcoming tasks
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
  
  console.log('🔔 Task reminder cron initialized (running every minute)');
};