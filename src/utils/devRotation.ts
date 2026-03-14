// utils/devRotation.ts - UPDATED to respect inRotation field
import prisma from '../prisma';
import { TaskService } from '../services/task.services';

export async function checkAndFixRotation() {
  console.log('🔄 Checking rotation for all groups...');
  
  const groups = await prisma.group.findMany({
    include: {
      tasks: {
        where: { isRecurring: true },
        select: { id: true, createdAt: true }
      },
      members: {
        where: { 
          isActive: true,
          inRotation: true // Only count members in rotation
        },
        select: { userId: true }
      }
    }
  });

  for (const group of groups) {
    if (group.tasks.length === 0) {
      console.log(`⏭️ Group ${group.id} has no tasks, skipping`);
      continue;
    }

    if (group.members.length === 0) {
      console.log(`⏭️ Group ${group.id} has no members in rotation, skipping`);
      continue;
    }

    // Get the earliest task creation date
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

    // If we're behind, rotate
    if (expectedWeek > currentWeek) {
      const weeksBehind = expectedWeek - currentWeek;
      console.log(`⚠️ Group ${group.id} is ${weeksBehind} week(s) behind`);
      console.log(`   Members in rotation: ${group.members.length}`);
      
      // Find an admin to perform rotation
      const admin = await prisma.groupMember.findFirst({
        where: { 
          groupId: group.id, 
          groupRole: "ADMIN",
          isActive: true
          // Note: Admins have inRotation = false, but they can still rotate tasks
        },
        select: { userId: true }
      });

      if (!admin) {
        console.log(`   ❌ No active admin found for group ${group.id}`);
        continue;
      }

      console.log(`🔄 Auto-rotating group ${group.id} from week ${currentWeek} to ${expectedWeek}`);
      
      // 🔥 FORCE ROTATION for each week behind
      for (let i = 0; i < weeksBehind; i++) {
        console.log(`   Rotation ${i + 1}/${weeksBehind}...`);
        
        try {
          const result = await TaskService.rotateGroupTasks(group.id, admin.userId);
          
          if (result.success) {
            console.log(`   ✅ Rotated to week ${currentWeek + i + 1}`);
            
            // Log fairness metrics if available
            if (result.fairnessMetrics) {
              console.log(`      Fairness Score: ${result.fairnessMetrics.fairnessScore}%`);
              console.log(`      ${result.fairnessMetrics.lowestPointsMember} → ${result.fairnessMetrics.gotHighestTask}`);
              console.log(`      ${result.fairnessMetrics.highestPointsMember} → ${result.fairnessMetrics.gotLowestTask}`);
            }
          } else {
            console.log(`   ❌ Rotation failed: ${result.message}`);
            break;
          }
        } catch (error) {
          console.error(`   ❌ Error during rotation:`, error);
          break;
        }
      }
      
      // Verify final week
      const updatedGroup = await prisma.group.findUnique({
        where: { id: group.id },
        select: { 
          currentRotationWeek: true,
          members: {
            where: { inRotation: true },
            select: { userId: true }
          }
        }
      });
      
      console.log(`✅ Group ${group.id} now at week ${updatedGroup?.currentRotationWeek}`);
      console.log(`   Members in rotation: ${updatedGroup?.members.length || 0}`);
      
    } else {
      console.log(`✅ Group ${group.id} is already at correct week ${currentWeek}`);
      console.log(`   Members in rotation: ${group.members.length}`);
    }
  }
  
  console.log('✅ Rotation check complete');
}