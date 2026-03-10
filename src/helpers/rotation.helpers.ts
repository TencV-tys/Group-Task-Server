// helpers/rotation.helpers.ts - COMPLETELY FIXED with proper null checks
import prisma from "../prisma";

export interface RotationAnalysis {
  totalMembers: number;
  activeMembers: number;
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
  }>;
  warning: string | null;
  // ADD THESE NEW FIELDS
  currentWeek: number;
  expectedWeek: number;
  needsRotation: boolean;
  weeksBehind: number;
  groupCreatedAt: Date;
  earliestTaskCreatedAt: Date | null;
}

export class RotationHelpers {
  
  static async analyzeGroupRotation(groupId: string): Promise<RotationAnalysis> {
    // Get group info first (for creation date and current week)
    const group = await prisma.group.findUnique({ 
      where: { id: groupId },
      select: { 
        currentRotationWeek: true,
        createdAt: true
      }
    });

    // Get active members
    const activeMembers = await prisma.groupMember.findMany({
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

    // Get recurring tasks
    const recurringTasks = await prisma.task.findMany({
      where: { 
        groupId, 
        isRecurring: true 
      },
      orderBy: { rotationOrder: 'asc' }
    });

    // ===== Calculate expected week based on earliest task creation =====
    let earliestTaskCreatedAt: Date | null = null;
    let expectedWeek = 1;
    let needsRotation = false;
    let weeksBehind = 0;

    // ✅ FIX: Only process if there are tasks
    if (recurringTasks.length > 0) {
      // Create a new array with just the dates we need
      const taskDates: Date[] = recurringTasks.map(task => task.createdAt);
      
      // Sort the dates (oldest first)
      taskDates.sort((a, b) => a.getTime() - b.getTime());
      
      // Get the earliest date with null check
      if (taskDates.length > 0 && taskDates[0]) {
        earliestTaskCreatedAt = taskDates[0];

        // Calculate expected week based on earliest task
        const now = new Date();
        const daysSinceCreation = Math.floor(
          (now.getTime() - earliestTaskCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        expectedWeek = Math.floor(daysSinceCreation / 7) + 1;

        // Check if rotation is needed
        const currentWeek = group?.currentRotationWeek || 1;
        needsRotation = expectedWeek > currentWeek;
        weeksBehind = Math.max(0, expectedWeek - currentWeek);
      }
    }

    const memberCount = activeMembers.length;
    const taskCount = recurringTasks.length;
    
    // Calculate tasks per member in perfect rotation
    const tasksPerMember = memberCount > 0 ? taskCount / memberCount : 0;
    const hasEnoughTasks = taskCount >= memberCount;
    const tasksNeeded = Math.max(0, memberCount - taskCount);

    // Analyze which members get tasks this week
    const currentWeek = group?.currentRotationWeek || 1;

    const membersWithTasks = activeMembers.map(member => {
      // Calculate if this member gets a task this week
      let assignedTasks = 0;
      
      recurringTasks.forEach(task => {
        const rotationMembers = parseRotationMembers(task.rotationMembers);
        const memberIndex = rotationMembers.findIndex((m: any) => m.userId === member.userId);
        
        if (memberIndex !== -1) {
          const taskIndex = (task.rotationOrder || 1) - 1;
          const assigneeIndex = (taskIndex + currentWeek) % rotationMembers.length;
          if (assigneeIndex === memberIndex) {
            assignedTasks++;
          }
        }
      });

      return {
        id: member.userId,
        name: member.user.fullName,
        assignedTasks,
        willGetTasksThisWeek: assignedTasks > 0
      };
    });

    // Generate warning message
    let warning = null;
    if (taskCount === 0) {
      warning = "No recurring tasks created yet. Create tasks to start rotation.";
    } else if (taskCount < memberCount) {
      warning = `You have ${memberCount} members but only ${taskCount} recurring tasks. ${tasksNeeded} more task(s) needed for perfect rotation.`;
    } else if (taskCount > memberCount) {
      warning = `You have ${taskCount} tasks but only ${memberCount} members. Some members will get multiple tasks.`;
    } else if (needsRotation) {
      warning = `⚠️ Rotation needed: Week ${currentWeek} → Expected Week ${expectedWeek} (${weeksBehind} week(s) behind)`;
    }

    return {
      totalMembers: memberCount,
      activeMembers: memberCount,
      totalTasks: taskCount, 
      recurringTasks: taskCount,
      tasksPerMember,
      hasEnoughTasks,
      tasksNeeded,
      members: membersWithTasks,
      warning,
      // New fields
      currentWeek: currentWeek,
      expectedWeek,
      needsRotation,
      weeksBehind,
      groupCreatedAt: group?.createdAt || new Date(),
      earliestTaskCreatedAt
    };
  }

  static getRotationStatusMessage(analysis: RotationAnalysis): string {
    if (analysis.totalTasks === 0) {
      return "⚠️ No tasks yet. Create tasks to start rotation.";
    }
    
    if (!analysis.hasEnoughTasks) {
      return `⚠️ Need ${analysis.tasksNeeded} more task(s) for ${analysis.totalMembers} members. Currently ${analysis.totalTasks}/${analysis.totalMembers} tasks.`;
    }
    
    if (analysis.totalTasks === analysis.totalMembers) {
      if (analysis.needsRotation) {
        return `⚠️ Rotation needed: Week ${analysis.currentWeek} → Expected Week ${analysis.expectedWeek} (${analysis.weeksBehind} week(s) behind)`;
      }
      return `✅ Perfect! ${analysis.totalTasks} tasks for ${analysis.totalMembers} members - 1 task each.`;
    }
    
    if (analysis.totalTasks > analysis.totalMembers) {
      if (analysis.needsRotation) {
        return `⚠️ Rotation needed: Week ${analysis.currentWeek} → Expected Week ${analysis.expectedWeek} (${analysis.weeksBehind} week(s) behind)`;
      }
      return `ℹ️ ${analysis.totalTasks} tasks for ${analysis.totalMembers} members - some members get multiple tasks.`;
    }
    
    if (analysis.needsRotation) {
      return `⚠️ Rotation needed: Week ${analysis.currentWeek} → Expected Week ${analysis.expectedWeek}`;
    }
    
    return "Rotation ready.";
  }
}

function parseRotationMembers(rotationMembers: any): any[] { 
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