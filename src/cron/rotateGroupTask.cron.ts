// cron/rotateGroupTask.cron.ts - UPDATED VERSION
import cron from 'node-cron';
import { TaskService } from '../services/task.services';
import prisma from '../prisma';

export class CronService {
  
  static initialize() {
    console.log('⏰ Initializing cron jobs...'); 
    
    // Run every day at 00:01 AM
    cron.schedule('1 0 * * *', async () => {
      console.log(`[${new Date().toISOString()}] 🔄 Running rotation check`);
      
      try {
        // Get all groups with tasks
        const groups = await prisma.group.findMany({
          include: {
            tasks: {
              where: { 
                isRecurring: true,
                isDeleted: false 
              },
              select: { 
                id: true,
                title: true,
                createdAt: true,
                currentAssignee: true,
                points: true,
                timeSlots: {
                  select: { points: true }
                }
              }
            },
            members: {
              where: { isActive: true },
              select: {
                userId: true,
                cumulativePoints: true,
                rotationOrder: true,
                user: {
                  select: { fullName: true }
                }
              }
            }
          }
        });

        console.log(`📊 Found ${groups.length} groups to check`);

        for (const group of groups) {
          // Skip groups with no tasks
          if (group.tasks.length === 0) {
            console.log(`⏭️ Group ${group.name || group.id} has no tasks`);
            continue;
          }

          // Skip groups with no members
          if (group.members.length === 0) {
            console.log(`⏭️ Group ${group.name || group.id} has no active members`);
            continue;
          }

          // Check if rotation is needed based on group creation
          const shouldRotate = await this.shouldRotateGroup(group);
          
          if (shouldRotate) {
            console.log(`🔄 Processing group ${group.name || group.id}...`);
            
            // Calculate total points for each task
            const tasksWithPoints = group.tasks.map(task => {
              const totalPoints = task.timeSlots?.reduce((sum, slot) => sum + (slot.points || 0), 0) || task.points || 0;
              return { ...task, totalPoints };
            });

            // Sort tasks by points (highest to lowest)
            const sortedTasks = [...tasksWithPoints].sort((a, b) => b.totalPoints - a.totalPoints);
            
            // Sort members by cumulative points (lowest to highest)
            const sortedMembers = [...group.members].sort((a, b) => a.cumulativePoints - b.cumulativePoints);

            console.log(`   📊 Fair Rotation Analysis:`);
            console.log(`      Members (lowest points first):`, sortedMembers.map(m => `${m.user.fullName} (${m.cumulativePoints}pts)`));
            console.log(`      Tasks (highest points first):`, sortedTasks.map(t => `${t.title} (${t.totalPoints}pts)`));

            // Separate tasks into assigned and unassigned
            const assignedTasks = sortedTasks.filter(task => !!task.currentAssignee);
            const unassignedTasks = sortedTasks.filter(task => !task.currentAssignee);

            console.log(`   📋 Assigned tasks: ${assignedTasks.length}`);
            console.log(`   📭 Unassigned tasks: ${unassignedTasks.length}`);

            // Log unassigned tasks (they won't rotate)
            if (unassignedTasks.length > 0) {
              console.log(`   ⏸️ Skipping unassigned tasks:`);
              unassignedTasks.forEach(task => {
                console.log(`      • ${task.title} (created ${new Date(task.createdAt).toLocaleDateString()})`);
              });
            }

            // Only rotate tasks that have assigned members
            if (assignedTasks.length > 0) {
              console.log(`   🔄 Rotating ${assignedTasks.length} assigned tasks with fair algorithm...`);
              
              try {
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
                  console.log(`   ⚠️ No admin found for group ${group.name || group.id}`);
                  continue;
                }

                // Use rotateGroupTasks instead of rotateAssignedTasks
                const result = await TaskService.rotateGroupTasks(group.id, admin.userId);
                 
                if (result.success) {
                  console.log(`   ✅ Rotated ${assignedTasks.length} tasks successfully`);
                  console.log(`   📊 Fairness Metrics:`, result.fairnessMetrics);
                  
                  // Log the fairness proof
                  console.log(`   📋 ROTATION PROOF:`);
                  console.log(`      Lowest points member (${result.fairnessMetrics?.lowestPointsMember}) → got highest task (${result.fairnessMetrics?.gotHighestTask} - ${result.fairnessMetrics?.gotHighestPoints}pts)`);
                  console.log(`      Highest points member (${result.fairnessMetrics?.highestPointsMember}) → got lowest task (${result.fairnessMetrics?.gotLowestTask} - ${result.fairnessMetrics?.gotLowestPoints}pts)`);
                  console.log(`      Fairness Score: ${result.fairnessMetrics?.fairnessScore}%`);
                } else {
                  console.log(`   ❌ Rotation failed: ${result.message}`);
                }
              } catch (error) {
                console.error(`   ❌ Error rotating group:`, error);
              }
            } else {
              console.log(`   ℹ️ No assigned tasks to rotate`);
            }
          }
        }
      } catch (error) {
        console.error('❌ Cron job error:', error);
      }
    }, {
      timezone: "Asia/Manila"
    });

    console.log('✅ Rotation cron initialized');
  }

  private static async shouldRotateGroup(group: any): Promise<boolean> {
    const groupInfo = await prisma.group.findUnique({
      where: { id: group.id },
      select: { 
        createdAt: true,
        currentRotationWeek: true,
        lastRotationUpdate: true 
      }
    });

    if (!groupInfo) return false;

    const now = new Date();
    const daysSinceCreation = Math.floor(
      (now.getTime() - groupInfo.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    const expectedWeek = Math.floor(daysSinceCreation / 7) + 1;
    const shouldRotate = expectedWeek > groupInfo.currentRotationWeek;

    if (shouldRotate) {
      console.log(`📅 Group ${group.name || group.id}: Week ${groupInfo.currentRotationWeek} → ${expectedWeek}`);
    }

    return shouldRotate;
  }
}