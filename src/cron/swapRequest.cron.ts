import cron from 'node-cron';
import { SwapRequestService } from '../services/swapRequest.services';

// Run every hour to expire old swap requests
export const initSwapRequestCron = () => {
  // Schedule: '0 * * * *' means run at minute 0 of every hour
  // Format: second minute hour day-of-month month day-of-week
  cron.schedule('0 * * * *', async () => {
    console.log(`[${new Date().toISOString()}] Running cron job: Expire old swap requests`);
    
    try {
      const result = await SwapRequestService.expireOldRequests();
      
      if (result.success) {
        console.log(`[${new Date().toISOString()}] ✓ Expired ${result.count} swap requests`);
      } else {
        console.error(`[${new Date().toISOString()}] ✗ Failed to expire swap requests:`, result.message);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ✗ Cron job error:`, error);
    }
  });

  // Also run immediately on startup
  setTimeout(async () => {
    console.log(`[${new Date().toISOString()}] Running initial swap request expiration...`);
    const result = await SwapRequestService.expireOldRequests();
    if (result.success) {
      console.log(`[${new Date().toISOString()}] ✓ Initial expiration completed: ${result.count} requests expired`);
    }
  }, 5000); // Wait 5 seconds after server start

  console.log('🕐 Swap request cron job scheduled (runs every hour)');
};