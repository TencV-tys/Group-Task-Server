// utils/devRotation.ts - FIXED
import prisma from '../prisma';
import { TaskService } from '../services/task.services';

export async function checkAndFixRotation() {
  console.log('🔄 Checking rotation for all groups...');
  
  const groups = await prisma.group.findMany({
    include: {
      tasks: {
        where: { isRecurring: true },
        select: { id: true, createdAt: true }
      }
    }
  });

  for (const group of groups) {
    if (group.tasks.length === 0) continue;

    // Get the earliest task creation date
    const sortedTasks = [...group.tasks].sort((a, b) => 
      a.createdAt.getTime() - b.createdAt.getTime()
    );
    
    const earliestTask = sortedTasks[0];

    // ✅ Add null check
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
      
      // Find an admin to perform rotation
      const admin = await prisma.groupMember.findFirst({
        where: { groupId: group.id, groupRole: "ADMIN" },
        select: { userId: true }
      });

      if (admin) {
        console.log(`🔄 Auto-rotating group ${group.id} from week ${currentWeek} to ${expectedWeek}`);
        
        // ✅ Rotate multiple times to catch up
        for (let i = 0; i < weeksBehind; i++) {
          await TaskService.rotateGroupTasks(group.id, admin.userId);
        }
        console.log(`✅ Group ${group.id} now at week ${expectedWeek}`);
      }
    }
  }
  
  console.log('✅ Rotation check complete');
}