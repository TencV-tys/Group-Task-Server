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
}

export class RotationHelpers {
  
  static async analyzeGroupRotation(groupId: string): Promise<RotationAnalysis> {
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

    const memberCount = activeMembers.length;
    const taskCount = recurringTasks.length;
    
    // Calculate tasks per member in perfect rotation
    const tasksPerMember = memberCount > 0 ? taskCount / memberCount : 0;
    const hasEnoughTasks = taskCount >= memberCount;
    const tasksNeeded = Math.max(0, memberCount - taskCount);

    // Analyze which members get tasks this week
    const currentWeek = (await prisma.group.findUnique({ 
      where: { id: groupId },
      select: { currentRotationWeek: true }
    }))?.currentRotationWeek || 1;

    const membersWithTasks = activeMembers.map(member => {
      // Calculate if this member gets a task this week
      let assignedTasks = 0;
      
      recurringTasks.forEach(task => {
        const rotationMembers = JSON.parse(task.rotationMembers as string || '[]');
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
      warning
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
      return `✅ Perfect! ${analysis.totalTasks} tasks for ${analysis.totalMembers} members - 1 task each.`;
    }
    
    if (analysis.totalTasks > analysis.totalMembers) {
      return `ℹ️ ${analysis.totalTasks} tasks for ${analysis.totalMembers} members - some members get multiple tasks.`;
    }
    
    return "Rotation ready.";
  }
}