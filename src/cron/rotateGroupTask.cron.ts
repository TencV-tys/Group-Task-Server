// cron/rotateGroupTask.cron.ts - UPDATED with new rotation logic

import cron from 'node-cron';
import { TaskService } from '../services/task.services';
import { SocketService } from '../services/socket.services';
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
              },
              orderBy: { createdAt: 'asc' }
            },
            members: {
              where: { 
                isActive: true,
                inRotation: true
              },
              select: {
                userId: true,
                cumulativePoints: true,
                rotationOrder: true,
                groupRole: true,
                inRotation: true,
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

          // Filter members who are in rotation
          const membersInRotation = group.members.filter(m => m.inRotation);
          
          // Skip groups with no members in rotation
          if (membersInRotation.length === 0) {
            console.log(`⏭️ Group ${group.name || group.id} has no members in rotation`);
            continue;
          } 

          // Log rotation stats
          const admins = group.members.filter(m => m.groupRole === "ADMIN").length;
          console.log(`\n📋 Group: ${group.name || group.id}`);
          console.log(`   👥 Members in rotation: ${membersInRotation.length}, Admins: ${admins}`);

          // Check rotation based on EARLIEST TASK creation date
          const shouldRotate = await this.shouldRotateGroup(group);
          
          if (shouldRotate) {
            console.log(`   🔄 Processing group rotation...`);
            
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

            // ✅ Use the NEW rotateGroupTasks function (it handles everything internally)
            const result = await TaskService.rotateGroupTasks(group.id, admin.userId);
             
            if (result.success) {
              console.log(`   ✅ Rotated successfully to week ${result.newWeek}`);
              
              // Emit socket event
              if (result.newWeek && result.weekStart && result.weekEnd) {
                await SocketService.emitRotationCompleted(
                  group.id,
                  result.newWeek,
                  result.rotatedTasks || [],
                  result.weekStart,
                  result.weekEnd
                );
                console.log(`   📢 Emitted real-time rotation event for group ${group.id}`);
              }
              
              // Log results
              console.log(`   📊 Rotation Results:`);
              console.log(`      New Week: ${result.newWeek}`);
              console.log(`      Week Start: ${result.weekStart ? result.weekStart.toLocaleDateString() : 'N/A'}`);
              console.log(`      Week End: ${result.weekEnd ? result.weekEnd.toLocaleDateString() : 'N/A'}`);
              
              if (result.rotatedTasks && result.rotatedTasks.length > 0) {
                console.log(`      Tasks rotated:`);
                result.rotatedTasks.forEach((task: any, idx: number) => {
                  console.log(`         ${idx + 1}. ${task.taskTitle} (${task.taskPoints} pts) → ${task.newAssigneeName}`);
                });
              }
              
              if (result.note) {
                console.log(`      ℹ️ Note: ${result.note}`);
              }
              
            } else {
              console.log(`   ❌ Rotation failed: ${result.message}`);
            }
          } else {
            console.log(`   ✅ Group is at correct week ${group.currentRotationWeek}`);
          }
        }
      } catch (error) {
        console.error('❌ Cron job error:', error);
      }
    }, {
      timezone: "Asia/Manila"
    });

    console.log('✅ Rotation cron initialized (using pure member rotation)');
  }

  // Check if group should rotate based on earliest task creation date
  private static async shouldRotateGroup(group: any): Promise<boolean> {
    // Get the earliest task in the group
    const earliestTask = await prisma.task.findFirst({
      where: { 
        groupId: group.id,
        isRecurring: true,
        isDeleted: false
      },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true }
    });

    // If no tasks exist, don't rotate
    if (!earliestTask) {
      console.log(`   ℹ️ Group ${group.name || group.id} has no tasks to rotate`);
      return false;
    }

    const now = new Date();
    
    // Calculate days since FIRST task was created
    const daysSinceFirstTask = Math.floor(
      (now.getTime() - earliestTask.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Expected week = (days since first task / 7) + 1
    const expectedWeek = Math.floor(daysSinceFirstTask / 7) + 1;
    const currentWeek = group.currentRotationWeek;

    // Should rotate if expected week > current week
    const shouldRotate = expectedWeek > currentWeek;

    if (shouldRotate) {
      console.log(`   📅 First task created: ${earliestTask.createdAt.toLocaleDateString()}`);
      console.log(`   📊 Current week: ${currentWeek}, Expected week: ${expectedWeek} (${daysSinceFirstTask} days since first task)`);
    }

    return shouldRotate;
  }
}