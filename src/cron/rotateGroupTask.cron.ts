// cron/rotateGroupTask.cron.ts
import cron from 'node-cron';
import { TaskService } from '../services/task.services';
import prisma from '../prisma';

// Run every day at 00:01 AM to rotate tasks
export const initRotationCron = () => {
  // Schedule: '1 0 * * *' means run at 1 minute past midnight (00:01) every day
  // Format: second minute hour day-of-month month day-of-week
  cron.schedule('1 0 * * *', async () => {
    console.log(`[${new Date().toISOString()}] 🔄 Running rotation check cron job`);
    
    try {
      // Get all active groups with recurring tasks
      const groups = await prisma.group.findMany({
        where: {
          // Optional: Add filters if needed
        },
        include: {
          tasks: {
            where: {
              isRecurring: true,
              isDeleted: false
            },
            select: {
              id: true,
              title: true,
              createdAt: true
            }
          }
        }
      });

      console.log(`[${new Date().toISOString()}] 📊 Found ${groups.length} groups to check`);

      let rotatedCount = 0;
      let failedCount = 0;

      for (const group of groups) {
        // Skip groups with no recurring tasks
        if (group.tasks.length === 0) {
          console.log(`[${new Date().toISOString()}] ⏭️ Group ${group.name || group.id} has no recurring tasks, skipping`);
          continue;
        }

        // Check if rotation is needed based on group creation date
        const shouldRotate = await shouldRotateGroup(group);
        
        if (shouldRotate) {
          console.log(`[${new Date().toISOString()}] 🔄 Rotating group ${group.name || group.id}...`);
          
          try {
            // Find an admin to perform the rotation
            const admin = await prisma.groupMember.findFirst({
              where: {
                groupId: group.id,
                groupRole: "ADMIN",
                isActive: true
              },
              select: { userId: true }
            });
            
            if (!admin) {
              console.log(`[${new Date().toISOString()}] ⚠️ No admin found for group ${group.name || group.id}, skipping rotation`);
              failedCount++;
              continue;
            }

            // Perform the fair rotation
            const result = await TaskService.rotateGroupTasks(group.id, admin.userId);
            
            if (result.success) {
              rotatedCount++;
              console.log(`[${new Date().toISOString()}] ✅ Rotated group ${group.name || group.id}:`, result.message);
              
              // Log fairness metrics if available
              if (result.fairnessMetrics) {
                console.log(`[${new Date().toISOString()}] 📊 Fairness Metrics:`, result.fairnessMetrics);
                console.log(`[${new Date().toISOString()}] 📋 ROTATION PROOF:`);
                console.log(`   Lowest points member (${result.fairnessMetrics.lowestPointsMember}) → got highest task (${result.fairnessMetrics.gotHighestTask} - ${result.fairnessMetrics.gotHighestPoints}pts)`);
                console.log(`   Highest points member (${result.fairnessMetrics.highestPointsMember}) → got lowest task (${result.fairnessMetrics.gotLowestTask} - ${result.fairnessMetrics.gotLowestPoints}pts)`);
                console.log(`   Fairness Score: ${result.fairnessMetrics.fairnessScore}%`);
              }
            } else {
              failedCount++;
              console.log(`[${new Date().toISOString()}] ❌ Failed to rotate group ${group.name || group.id}:`, result.message);
            }
          } catch (error) {
            failedCount++;
            console.error(`[${new Date().toISOString()}] ❌ Error rotating group ${group.name || group.id}:`, error);
          }
        } else {
          console.log(`[${new Date().toISOString()}] ⏭️ Group ${group.name || group.id} does not need rotation yet`);
        }
      }

      console.log(`[${new Date().toISOString()}] ✅ Rotation cron completed: ${rotatedCount} rotated, ${failedCount} failed`);

    } catch (error) {
      console.error(`[${new Date().toISOString()}] ❌ Rotation cron job error:`, error);
    }
  });

  // Also run immediately on startup (after 10 seconds to ensure everything is loaded)
  setTimeout(async () => {
    console.log(`[${new Date().toISOString()}] 🔄 Running initial rotation check on startup...`);
    
    try {
      const groups = await prisma.group.findMany({
        include: {
          tasks: {
            where: { isRecurring: true },
            select: { id: true }
          }
        }
      });

      let rotatedCount = 0;
      
      for (const group of groups) {
        if (group.tasks.length === 0) continue;
        
        const shouldRotate = await shouldRotateGroup(group);
        if (shouldRotate) {
          const admin = await prisma.groupMember.findFirst({
            where: { groupId: group.id, groupRole: "ADMIN" },
            select: { userId: true }
          });
          
          if (admin) {
            const result = await TaskService.rotateGroupTasks(group.id, admin.userId);
            if (result.success) rotatedCount++;
          }
        }
      }
      
      console.log(`[${new Date().toISOString()}] ✓ Initial rotation completed: ${rotatedCount} groups rotated`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ✗ Initial rotation error:`, error);
    }
  }, 10000); // Wait 10 seconds after server start

  console.log('🕐 Rotation cron job scheduled (runs every day at 00:01 AM)');
};

// Helper function to check if a group needs rotation
async function shouldRotateGroup(group: any): Promise<boolean> {
  try {
    // Get group info with creation date
    const groupInfo = await prisma.group.findUnique({
      where: { id: group.id },
      select: {
        createdAt: true,
        name: true,
        currentRotationWeek: true,
        lastRotationUpdate: true
      }
    });

    if (!groupInfo) {
      return false;
    }

    const now = new Date();
    
    // Calculate days since group creation
    const daysSinceCreation = Math.floor(
      (now.getTime() - groupInfo.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Calculate expected week (Week 1 starts on creation day)
    const expectedWeek = Math.floor(daysSinceCreation / 7) + 1;
    
    // Get current rotation week
    const currentWeek = groupInfo.currentRotationWeek;
    
    // Calculate days since last rotation
    const lastRotation = groupInfo.lastRotationUpdate || groupInfo.createdAt;
    const daysSinceLastRotation = Math.floor(
      (now.getTime() - lastRotation.getTime()) / (1000 * 60 * 60 * 24)
    );

    // LOGIC: Rotate if:
    // 1. Expected week is greater than current week, AND
    // 2. At least 7 days have passed since last rotation
    const shouldRotate = expectedWeek > currentWeek && daysSinceLastRotation >= 7;
    
    console.log(`[${new Date().toISOString()}] 📅 Group: ${groupInfo.name || group.id}`);
    console.log(`   Created: ${groupInfo.createdAt.toLocaleDateString()}`);
    console.log(`   Days since creation: ${daysSinceCreation}`);
    console.log(`   Expected week: ${expectedWeek}`);
    console.log(`   Current week: ${currentWeek}`);
    console.log(`   Days since last rotation: ${daysSinceLastRotation}`);
    console.log(`   Should rotate: ${shouldRotate ? 'YES ✓' : 'NO ✗'}`);

    return shouldRotate;

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error checking rotation for group ${group.id}:`, error);
    return false;
  }
}

// Manual trigger function (can be imported and used elsewhere)
export const manualRotateGroup = async (groupId: string, adminId: string) => {
  console.log(`[${new Date().toISOString()}] 🔄 Manually rotating group ${groupId}...`);
  
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { name: true }
  });
  
  console.log(`   Group: ${group?.name || groupId}`);
  const result = await TaskService.rotateGroupTasks(groupId, adminId);
  
  if (result.success) {
    console.log(`[${new Date().toISOString()}] ✅ Manual rotation successful:`, result.message);
    if (result.fairnessMetrics) {
      console.log('📊 Fairness Metrics:', result.fairnessMetrics);
    }
  } else {
    console.log(`[${new Date().toISOString()}] ❌ Manual rotation failed:`, result.message);
  }
  
  return result;
};

// Force check all groups (for debugging)
export const forceCheckAllGroups = async () => {
  console.log(`[${new Date().toISOString()}] 🔍 Force checking all groups...`);
  
  const groups = await prisma.group.findMany({
    include: {
      tasks: {
        where: { isRecurring: true },
        select: { id: true, title: true }
      }
    }
  });

  const results = [];
  for (const group of groups) {
    const shouldRotate = await shouldRotateGroup(group);
    results.push({
      groupId: group.id,
      groupName: group.name,
      taskCount: group.tasks.length,
      shouldRotate,
      tasks: group.tasks.map(t => t.title)
    });
  }

  console.log(`[${new Date().toISOString()}] 📊 Force check results:`, results);
  return results;
};