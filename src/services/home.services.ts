import prisma from "../prisma";

export class HomeServices {
  static async getHomeData(userId: string) {
    try {
      console.log(`Fetching home data for user: ${userId}`);

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true
        }
      });

      if (!user) {
        return {
          success: false,
          message: "User not found"
        };
      }

      // FIXED: Changed 'where: {id: userId}' to 'where: {userId: userId}'
      const groupsCount = await prisma.groupMember.count({
        where: { userId: userId } // Fixed
      });

      const tasksDue = await prisma.assignment.count({
        where: {
          userId: userId, // Fixed
          completed: false,
          dueDate: { lt: new Date() }
        }
      });

      const completedTasks = await prisma.assignment.count({
        where: {
          userId: userId, // Fixed
          completed: true
        }
      });

      // FIXED: Changed 'where: { id: userId }' to 'where: { userId: userId }'
      const recentActivity = await prisma.userNotification.findMany({
        where: { userId: userId }, // Fixed
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          createdAt: true,
          read: true
        }
      });

      // Additional stats you might want:
      // Total tasks assigned
      const totalTasks = await prisma.assignment.count({
        where: { userId: userId }
      });

      // Groups with task assignments
      const groupsWithTasks = await prisma.groupMember.findMany({
        where: { userId: userId },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              _count: {
                select: {
                  tasks: true
                  // Add more counts as needed
                }
              }
            }
          }
        }
      });

      return {
        success: true,
        data: {
          user: {
            ...user,
            groupsCount,
            tasksDue,
            totalTasks,
            completedTasks
          },
          stats: {
            groupsCount,
            tasksDue,
            completedTasks,
            totalTasks,
            completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
          },
          recentActivity: recentActivity.map(activity => ({
            ...activity,
            icon: this.getActivityIcon(activity.type),
            timeAgo: this.getTimeAgo(activity.createdAt)
          })),
          groups: groupsWithTasks.map(member => ({
            id: member.group.id,
            name: member.group.name,
            taskCount: member.group._count.tasks,
            role: member.groupRole
          }))
        }
      };

    } catch (e: any) {
      console.error("HomeServices error:", e);
      return {
        success: false,
        message: e.message || "Internal server error"
      };
    }
  }

  static getActivityIcon(type: string) {
    const icons: Record<string, string> = {
      TASK_ASSIGNED: '📝',
      TASK_COMPLETED: '✅',
      GROUP_JOINED: '👥',
      GROUP_CREATED: '🏠',
      MENTION: '💬',
      REMINDER: '⏰'
    };
    return icons[type] || '📌';
  }

  static getTimeAgo(date: Date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }
}