// cron/rotateGroupTask.cron.ts - FINAL VERSION
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
                currentAssignee: true, // Has assigned member?
                assignments: {
                  where: {
                    completed: false
                  },
                  select: { id: true }
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

          // Check if rotation is needed based on group creation
          const shouldRotate = await this.shouldRotateGroup(group);
          
          if (shouldRotate) {
            console.log(`🔄 Processing group ${group.name || group.id}...`);
            
            // Separate tasks into assigned and unassigned
            const assignedTasks = group.tasks.filter(task => {
              // Task has a current assignee AND has active assignments
              const hasAssignee = !!task.currentAssignee;
              const hasActiveAssignments = task.assignments && task.assignments.length > 0;
              return hasAssignee || hasActiveAssignments;
            });

            const unassignedTasks = group.tasks.filter(task => {
              const hasAssignee = !!task.currentAssignee;
              const hasActiveAssignments = task.assignments && task.assignments.length > 0;
              return !hasAssignee && !hasActiveAssignments;
            });

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
              console.log(`   🔄 Rotating ${assignedTasks.length} assigned tasks...`);
              
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

                // Perform rotation ONLY for assigned tasks
                const result = await TaskService.rotateAssignedTasks(
                  group.id, 
                  admin.userId,
                  assignedTasks.map(t => t.id) // Only pass assigned task IDs
                );
                 
                if (result.success) {
                  console.log(`   ✅ Rotated ${assignedTasks.length} tasks successfully`);
                  
                  // Log which tasks rotated
                  assignedTasks.forEach(task => {
                    console.log(`      ✓ ${task.title} (assigned to member)`);
                  });
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