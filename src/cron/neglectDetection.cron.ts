// cron/neglectDetection.cron.ts - NEW FILE
import cron from 'node-cron';
import prisma from '../prisma';
import { AssignmentService } from '../services/assignment.services';

export const initNeglectDetectionCron = () => {
  // Run every 30 minutes to check for neglected assignments
  cron.schedule('*/30 * * * *', async () => {
    console.log('🕒 Running neglect detection cron job...');
    
    try {
      // Get all active groups
      const groups = await prisma.group.findMany({
        select: { id: true }
      });
      
      console.log(`📊 Checking ${groups.length} groups for neglected assignments`);
      
      let totalNeglected = 0;
      let totalDeductions = 0;
      
      for (const group of groups) {
        const result = await AssignmentService.checkAndApplyNeglectPenalties(group.id);
        
        if (result.success && result.neglectedAssignments) {
          totalNeglected += result.neglectedAssignments.length;
          if (result.pointDeductions) {
            totalDeductions += result.pointDeductions.reduce(
              (sum, d) => sum + Math.abs(d.deductedPoints), 0
            );
          }
        }
      }
      
      console.log(`✅ Neglect detection complete: Found ${totalNeglected} neglected assignments, total deductions: ${totalDeductions} points`);
      
    } catch (error) {
      console.error('❌ Error in neglect detection cron job:', error);
    }
  });
  
  // Also run at specific times to catch end of day
  cron.schedule('0 23 * * *', async () => { // 11 PM every day
    console.log('🌙 Running end-of-day neglect check...');
    
    try {
      const groups = await prisma.group.findMany({
        select: { id: true }
      });
      
      for (const group of groups) {
        await AssignmentService.checkAndApplyNeglectPenalties(group.id);
      }
      
      console.log('✅ End-of-day neglect check complete');
      
    } catch (error) {
      console.error('❌ Error in end-of-day neglect check:', error);
    }
  });
  
  console.log('⏰ Neglect detection cron job initialized');
};