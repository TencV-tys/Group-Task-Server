// cron/neglectDetection.cron.ts - UPDATED
import cron from 'node-cron';
import prisma from '../prisma';
import { AssignmentService } from '../services/assignment.services';

export const initNeglectDetectionCron = () => {
  // Run every 30 minutes to check for neglected assignments
  cron.schedule('*/30 * * * *', async () => {
    console.log('🕒 Running neglect detection cron job...');
    
    try {
      const result = await AssignmentService.checkNeglectedAssignments();
      
      if (result.success) {
        console.log(`✅ Neglect detection complete: Found ${result.totalNeglected || 0} neglected assignments`);
      } else {
        console.log(`❌ Neglect detection error: ${result.message}`);
      }
      
    } catch (error) {
      console.error('❌ Error in neglect detection cron job:', error);
    }
  });
  
  // Run at 11:30 PM every day for end-of-day check
  cron.schedule('30 23 * * *', async () => { // 11:30 PM every day
    console.log('🌙 Running end-of-day neglect check...');
    
    try {
      const result = await AssignmentService.checkNeglectedAssignments();
      
      if (result.success) {
        console.log(`✅ End-of-day neglect check complete: Found ${result.totalNeglected || 0} neglected assignments`);
      } else {
        console.log(`❌ End-of-day neglect check error: ${result.message}`);
      }
      
    } catch (error) {
      console.error('❌ Error in end-of-day neglect check:', error);
    }
  });
  
  console.log('⏰ Neglect detection cron job initialized');
};