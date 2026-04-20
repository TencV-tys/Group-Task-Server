// cron/neglectDetection.cron.ts - FIXED BACK TO 30 MINUTES
import cron from 'node-cron';
import { AssignmentService } from '../services/assignment.services';

export const initNeglectDetectionCron = () => {
  // Runs every 30 minutes including 11:30 PM — no separate end-of-day needed
  cron.schedule('*/30 * * * *', async () => {
    console.log('🕒 Running neglect detection cron job...');
    console.log('⏱️ Current time:', new Date().toISOString());

    try {
      const startTime = Date.now();
      const result = await AssignmentService.checkNeglectedAssignments();
      const endTime = Date.now();

      if (result.success) {
        console.log(`✅ Neglect detection complete in ${endTime - startTime}ms: Found ${result.totalNeglected || 0} neglected assignments`);
      } else {
        console.log(`❌ Neglect detection error: ${result.message}`);
      }
    } catch (error) { 
      console.error('❌ Error in neglect detection cron job:', error);
    }
  });

  console.log('⏰ Neglect detection cron job initialized (running every 30 minutes)');
};