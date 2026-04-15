// helpers/rotation.helpers.ts - IMPROVED VERSION

import prisma from "../prisma";

export interface RotationAnalysis {
  totalMembers: number;
  activeMembers: number;
  membersInRotation: number;
  admins: number;
  totalTasks: number;
  recurringTasks: number;
  tasksPerMember: number;
  hasEnoughTasks: boolean;
  tasksNeeded: number;
  members: Array<{
    id: string;
    name: string;
    assignedTasks: number;
    willGetTasksThisWeek: boolean;
    inRotation: boolean;
    role: string;
  }>;
  warning: string | null;
  currentWeek: number;
  expectedWeek: number;
  needsRotation: boolean;
  weeksBehind: number;
  groupCreatedAt: Date;
  earliestTaskCreatedAt: Date | null;
}

export class RotationHelpers {
  
  static async analyzeGroupRotation(groupId: string): Promise<RotationAnalysis> {
    const group = await prisma.group.findUnique({ 
      where: { id: groupId },
      select: { 
        currentRotationWeek: true,
        createdAt: true
      }
    }); 
 
    const allActiveMembers = await prisma.groupMember.findMany({
      where: { 
        groupId, 
        isActive: true 
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true
          }
        }
      },
      orderBy: { rotationOrder: 'asc' }
    });

    const membersInRotation = allActiveMembers.filter(m => m.inRotation);
    const admins = allActiveMembers.filter(m => m.groupRole === "ADMIN");

    const recurringTasks = await prisma.task.findMany({
      where: { 
        groupId, 
        isRecurring: true,
        isDeleted: false
      },
      orderBy: { rotationOrder: 'asc' }
    });

    // ✅ FIXED: Use UTC for expected week calculation
    let earliestTaskCreatedAt: Date | null = null;
    let expectedWeek = 1;
    let needsRotation = false;
    let weeksBehind = 0;

    if (recurringTasks.length > 0) {
      const taskDates: Date[] = recurringTasks.map(task => task.createdAt);
      taskDates.sort((a, b) => a.getTime() - b.getTime());
      
      if (taskDates.length > 0 && taskDates[0]) {
        earliestTaskCreatedAt = taskDates[0];

        const now = new Date();
        // ✅ Use UTC for day calculation
        const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const earliestUTC = Date.UTC(
          earliestTaskCreatedAt.getUTCFullYear(),
          earliestTaskCreatedAt.getUTCMonth(),
          earliestTaskCreatedAt.getUTCDate()
        );
        
        const daysSinceCreation = Math.floor((nowUTC - earliestUTC) / (1000 * 60 * 60 * 24));
        expectedWeek = Math.floor(daysSinceCreation / 7) + 1;

        const currentWeek = group?.currentRotationWeek || 1;
        needsRotation = expectedWeek > currentWeek;
        weeksBehind = Math.max(0, expectedWeek - currentWeek);
      }
    }

    const memberCount = allActiveMembers.length;
    const membersInRotationCount = membersInRotation.length;
    const taskCount = recurringTasks.length;
    
    const tasksPerMember = membersInRotationCount > 0 ? taskCount / membersInRotationCount : 0;
    const hasEnoughTasks = taskCount >= membersInRotationCount;
    const tasksNeeded = Math.max(0, membersInRotationCount - taskCount);

    const currentWeek = group?.currentRotationWeek || 1;

    const membersWithTasks = allActiveMembers.map(member => {
      let assignedTasks = 0;
      
      if (member.inRotation) {
        recurringTasks.forEach(task => {
          const rotationMembers = RotationHelpers.parseRotationMembers(task.rotationMembers);
          const validRotationMembers = rotationMembers.filter((rm: any) => 
            membersInRotation.some(m => m.userId === rm.userId)
          );
          
          if (validRotationMembers.length === 0) return;
          
          const memberIndex = validRotationMembers.findIndex((m: any) => m.userId === member.userId);
          
          if (memberIndex !== -1) {
            const taskIndex = (task.rotationOrder || 1) - 1;
            const assigneeIndex = (taskIndex + currentWeek) % validRotationMembers.length;
            if (assigneeIndex === memberIndex) {
              assignedTasks++;
            }
          }
        });
      }

      return {
        id: member.userId,
        name: member.user.fullName,
        assignedTasks,
        willGetTasksThisWeek: assignedTasks > 0,
        inRotation: member.inRotation,
        role: member.groupRole
      };
    });

    let warning = null;
    if (membersInRotationCount === 0) {
      warning = "No members are set to receive tasks. Please add members to rotation.";
    } else if (taskCount === 0) {
      warning = "No recurring tasks created yet. Create tasks to start rotation.";
    } else if (taskCount < membersInRotationCount) {
      warning = `You have ${membersInRotationCount} members in rotation but only ${taskCount} recurring tasks. Need ${tasksNeeded} more task(s) for perfect rotation.`;
    } else if (taskCount > membersInRotationCount) {
      warning = `You have ${taskCount} tasks but only ${membersInRotationCount} members in rotation. Some members will get multiple tasks.`;
    } else if (needsRotation) {
      warning = `⚠️ Rotation needed: Week ${currentWeek} → Expected Week ${expectedWeek} (${weeksBehind} week(s) behind)`;
    }

    return {
      totalMembers: memberCount,
      activeMembers: memberCount,
      membersInRotation: membersInRotationCount,
      admins: admins.length,
      totalTasks: taskCount, 
      recurringTasks: taskCount,
      tasksPerMember,
      hasEnoughTasks,
      tasksNeeded,
      members: membersWithTasks,
      warning,
      currentWeek: currentWeek,
      expectedWeek,
      needsRotation,
      weeksBehind,
      groupCreatedAt: group?.createdAt || new Date(),
      earliestTaskCreatedAt
    };
  }

  static getRotationStatusMessage(analysis: RotationAnalysis): string {
    if (analysis.membersInRotation === 0) {
      return "⚠️ No members in rotation. Please add members to rotation.";
    }
    
    if (analysis.totalTasks === 0) {
      return "⚠️ No tasks yet. Create tasks to start rotation.";
    }
    
    if (!analysis.hasEnoughTasks) {
      return `⚠️ Need ${analysis.tasksNeeded} more task(s) for ${analysis.membersInRotation} members in rotation. Currently ${analysis.totalTasks}/${analysis.membersInRotation} tasks.`;
    }
    
    if (analysis.totalTasks === analysis.membersInRotation) {
      if (analysis.needsRotation) {
        return `⚠️ Rotation needed: Week ${analysis.currentWeek} → Expected Week ${analysis.expectedWeek} (${analysis.weeksBehind} week(s) behind)`;
      }
      return `✅ Perfect! ${analysis.totalTasks} tasks for ${analysis.membersInRotation} members - 1 task each.`;
    }
    
    if (analysis.totalTasks > analysis.membersInRotation) {
      if (analysis.needsRotation) {
        return `⚠️ Rotation needed: Week ${analysis.currentWeek} → Expected Week ${analysis.expectedWeek} (${analysis.weeksBehind} week(s) behind)`;
      }
      return `ℹ️ ${analysis.totalTasks} tasks for ${analysis.membersInRotation} members - some members get multiple tasks.`;
    }
    
    if (analysis.needsRotation) {
      return `⚠️ Rotation needed: Week ${analysis.currentWeek} → Expected Week ${analysis.expectedWeek}`;
    }
    
    return "Rotation ready.";
  }

  // ✅ Made static and properly typed
  static parseRotationMembers(rotationMembers: any): any[] { 
    if (!rotationMembers) return [];
    if (Array.isArray(rotationMembers)) return rotationMembers;
    if (typeof rotationMembers === 'string') {
      try {
        return JSON.parse(rotationMembers) || [];
      } catch { 
        return [];
      }
    }
    return [];
  }
}