// utils/devRotation.ts - UPDATED to adapt to current time and trigger notifications
import prisma from '../prisma';
import { TaskService } from '../services/task.services';
import { UserNotificationService } from '../services/user.notification.services';

export async function checkAndFixRotation() {
  console.log('🔄 Checking rotation for all groups...');
  console.log(`📅 Current time: ${new Date().toISOString()}`);
  
  const groups = await prisma.group.findMany({
    include: {
      tasks: {
        where: { isRecurring: true },
        select: { id: true, title: true, createdAt: true }
      },
      members: {
        where: { 
          isActive: true,
          inRotation: true
        },
        select: { userId: true }
      }
    }
  });

  let totalRotationsPerformed = 0;
  let totalNotificationsSent = 0;

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
      console.log(`   Current week: ${currentWeek}, Expected week: ${expectedWeek}`);
      console.log(`   Members in rotation: ${group.members.length}`);
      
      // Find an admin to perform rotation
      const admin = await prisma.groupMember.findFirst({
        where: { 
          groupId: group.id, 
          groupRole: "ADMIN",
          isActive: true
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
            totalRotationsPerformed++;
            
            // ===== NEW: Send notifications about the rotation =====
            await sendRotationNotifications(group, result, currentWeek + i + 1);
            totalNotificationsSent += group.members.length;
            
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
  console.log(`📊 Summary: ${totalRotationsPerformed} rotations performed, ${totalNotificationsSent} notifications sent`);
}

// ===== NEW: Helper function to send rotation notifications =====
async function sendRotationNotifications(group: any, rotationResult: any, newWeek: number) {
  try {
    // Get all members in the group
    const members = await prisma.groupMember.findMany({
      where: { 
        groupId: group.id,
        isActive: true
      },
      select: { 
        userId: true,
        inRotation: true,
        user: {
          select: { fullName: true }
        }
      }
    });

    // Get group info
    const groupInfo = await prisma.group.findUnique({
      where: { id: group.id },
      select: { name: true }
    });

    // Send notification to each member
    for (const member of members) {
      // Find which tasks this member got in the rotation
      const memberTasks = rotationResult.rotatedTasks?.filter(
        (t: any) => t.newAssignee === member.userId
      ) || [];

      const taskList = memberTasks.map((t: any) => `• ${t.taskTitle} (${t.taskPoints} pts)`).join('\n');

      await UserNotificationService.createNotification({
        userId: member.userId,
        type: "ROTATION_COMPLETED",
        title: member.inRotation ? "🔄 New Weekly Tasks" : "📢 Rotation Completed",
        message: member.inRotation 
          ? `Week ${newWeek} has started! You have ${memberTasks.length} new task(s).`
          : `Week ${newWeek} has started in ${groupInfo?.name || 'your group'}.`,
        data: {
          groupId: group.id,
          groupName: groupInfo?.name,
          newWeek,
          inRotation: member.inRotation,
          tasks: memberTasks,
          taskCount: memberTasks.length,
          taskList,
          fairnessMetrics: rotationResult.fairnessMetrics,
          timestamp: new Date()
        }
      });
    }

    console.log(`   📢 Sent rotation notifications to ${members.length} members`);
  } catch (error) {
    console.error('   ❌ Failed to send rotation notifications:', error);
  }
} 