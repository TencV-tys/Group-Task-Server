// services/admin.groups.services.ts - COMPLETE WITH REPORT ANALYSIS
import prisma from "../prisma";
import { ReportType, ReportStatus } from "@prisma/client";

export interface GroupFilters {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  minMembers?: number;
  maxMembers?: number;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface GroupMember {
  id: string;
  userId: string;
  groupRole: string;
  joinedAt: Date;
  user: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
    roleStatus: string;
  };
}

export interface GroupWithDetails {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  inviteCode: string;
  createdAt: Date;
  updatedAt: Date;
  currentRotationWeek: number;
  lastRotationUpdate: Date | null;
  settings: any;
  _count: {
    members: number;
    tasks: number;
    reports: number;
  };
  creator: {
    id: string;
    fullName: string;
    email: string;
  };
  members?: GroupMember[];
  recentTasks?: any[];
}

// ===== REPORT ACTION RULES =====
const REPORT_ACTION_RULES = {
  [ReportType.INAPPROPRIATE_CONTENT]: {
    threshold: 2,
    suggestedAction: 'SOFT_DELETE',
    severity: 'MEDIUM',
    message: 'Multiple reports of inappropriate content',
    color: '#e67700'
  },
  [ReportType.HARASSMENT]: {
    threshold: 1,
    suggestedAction: 'SUSPEND',
    severity: 'HIGH',
    message: 'Harassment reported - immediate action required',
    color: '#fa5252'
  },
  [ReportType.SPAM]: {
    threshold: 3,
    suggestedAction: 'SOFT_DELETE',
    severity: 'LOW',
    message: 'Multiple spam reports',
    color: '#868e96'
  },
  [ReportType.OFFENSIVE_BEHAVIOR]: {
    threshold: 2,
    suggestedAction: 'WARNING',
    severity: 'MEDIUM',
    message: 'Offensive behavior reported',
    color: '#e67700'
  },
  [ReportType.TASK_ABUSE]: {
    threshold: 2,
    suggestedAction: 'SOFT_DELETE',
    severity: 'MEDIUM',
    message: 'Task abuse detected',
    color: '#e67700'
  },
  [ReportType.GROUP_MISUSE]: {
    threshold: 2,
    suggestedAction: 'HARD_DELETE',
    severity: 'HIGH',
    message: 'Group misuse - permanent action recommended',
    color: '#fa5252'
  },
  [ReportType.OTHER]: {
    threshold: 3,
    suggestedAction: 'REVIEW',
    severity: 'LOW',
    message: 'Multiple miscellaneous reports',
    color: '#868e96'
  }
};

export interface ReportAnalysis {
  groupId: string;
  groupName: string;
  reportCount: number;
  reportTypes: {
    type: ReportType;
    count: number;
    threshold: number;
    suggestedAction: string;
    severity: string;
    message: string;
    meetsThreshold: boolean;
  }[];
  suggestedActions: {
    action: string;
    reason: string;
    severity: string;
    reportTypes: ReportType[];
  }[];
  requiresImmediateAction: boolean;
}

export class AdminGroupsService {
  
  // ========== GET ALL GROUPS WITH FILTERS ==========
  static async getGroups(filters: GroupFilters = {}) {
    try {
      const {
        search,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        minMembers,
        maxMembers,
        createdAfter,
        createdBefore
      } = filters;

      // Build where clause
      const where: any = {};

      // Search filter
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { inviteCode: { contains: search, mode: 'insensitive' } }
        ];
      }

      // Date filters
      if (createdAfter || createdBefore) {
        where.createdAt = {};
        if (createdAfter) where.createdAt.gte = createdAfter;
        if (createdBefore) where.createdAt.lte = createdBefore;
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get groups with counts
      const [groups, total] = await Promise.all([
        prisma.group.findMany({
          where,
          include: {
            creator: {
              select: {
                id: true,
                fullName: true,
                email: true
              }
            },
            _count: {
              select: {
                members: true,
                tasks: {
                  where: {
                    isDeleted: false
                  }
                },
                reports: {
                  where: {
                    status: {
                      in: ['PENDING', 'REVIEWING']
                    }
                  }
                }
              }
            },
            members: {
              take: 5,
              include: {
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    email: true,
                    avatarUrl: true,
                    roleStatus: true
                  }
                }
              },
              orderBy: {
                joinedAt: 'desc'
              }
            }
          },
          orderBy: {
            [sortBy]: sortOrder
          },
          skip,
          take: limit
        }),
        prisma.group.count({ where })
      ]);

      // Filter by member count if needed (done in memory)
      let filteredGroups = groups;
      if (minMembers !== undefined || maxMembers !== undefined) {
        filteredGroups = groups.filter(group => {
          const memberCount = group._count.members;
          if (minMembers !== undefined && memberCount < minMembers) return false;
          if (maxMembers !== undefined && memberCount > maxMembers) return false;
          return true;
        });
      }

      // Format response
      const formattedGroups = filteredGroups.map(group => ({
        id: group.id,
        name: group.name,
        description: group.description,
        avatarUrl: group.avatarUrl,
        inviteCode: group.inviteCode,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        currentRotationWeek: group.currentRotationWeek,
        lastRotationUpdate: group.lastRotationUpdate,
        settings: group.settings,
        creator: group.creator,
        _count: group._count,
        members: group.members.map(m => ({
          id: m.id,
          userId: m.userId,
          groupRole: m.groupRole,
          joinedAt: m.joinedAt,
          user: m.user
        }))
      }));

      return {
        success: true,
        message: 'Groups retrieved successfully',
        groups: formattedGroups,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit)
        }
      };

    } catch (error: any) {
      console.error('Error fetching groups:', error);
      return {
        success: false,
        message: error.message || 'Failed to fetch groups'
      };
    }
  }

  // ========== GET GROUP BY ID WITH FULL DETAILS ==========
  static async getGroupById(groupId: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          creator: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true
            }
          },
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  avatarUrl: true,
                  roleStatus: true,
                  createdAt: true,
                  lastLoginAt: true
                }
              }
            },
            orderBy: {
              joinedAt: 'asc'
            }
          },
          tasks: {
            where: {
              isDeleted: false
            },
            include: {
              timeSlots: true,
              _count: {
                select: {
                  assignments: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          },
          reports: {
            include: {
              reporter: {
                select: {
                  id: true,
                  fullName: true,
                  email: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 10
          },
          _count: {
            select: {
              members: true,
              tasks: {
                where: {
                  isDeleted: false
                }
              },
              reports: true
            }
          }
        }
      });

      if (!group) {
        return {
          success: false,
          message: 'Group not found'
        };
      }

      // Calculate additional stats
      const activeMembers = group.members.filter(m => m.user.roleStatus === 'ACTIVE').length;
      const totalTasks = group.tasks.length;
      const completedTasks = await prisma.assignment.count({
        where: {
          task: {
            groupId
          },
          completed: true,
          verified: true
        }
      });

      // Get report analysis
      const analysis = await this.analyzeGroupReports(groupId);

      return {
        success: true,
        message: 'Group retrieved successfully',
        group: {
          ...group,
          stats: {
            activeMembers,
            totalTasks,
            completedTasks,
            completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
          },
          reportAnalysis: analysis.success ? analysis.analysis : null
        }
      };

    } catch (error: any) {
      console.error('Error fetching group:', error);
      return {
        success: false,
        message: error.message || 'Failed to fetch group'
      };
    }
  }

  // ========== ANALYZE GROUP REPORTS ==========
  static async analyzeGroupReports(groupId: string): Promise<{
    success: boolean;
    analysis?: ReportAnalysis;
    message?: string;
  }> {
    try {
      // Get group with its reports
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          reports: {
            where: {
              status: {
                in: ['PENDING', 'REVIEWING']
              }
            },
            select: {
              id: true,
              type: true,
              status: true,
              description: true,
              createdAt: true
            }
          }
        }
      });

      if (!group) {
        return {
          success: false,
          message: 'Group not found'
        };
      }

      // Count reports by type
      const reportCountByType = new Map<ReportType, number>();
      group.reports.forEach(report => {
        const count = reportCountByType.get(report.type as ReportType) || 0;
        reportCountByType.set(report.type as ReportType, count + 1);
      });

      // Analyze each report type
      const reportTypes = Array.from(reportCountByType.entries()).map(([type, count]) => {
        const rule = REPORT_ACTION_RULES[type] || {
          threshold: 3,
          suggestedAction: 'REVIEW',
          severity: 'LOW',
          message: 'Multiple reports'
        };

        return {
          type,
          count,
          threshold: rule.threshold,
          suggestedAction: rule.suggestedAction,
          severity: rule.severity,
          message: rule.message,
          meetsThreshold: count >= rule.threshold
        };
      });

      // Group suggested actions
      const actionGroups = new Map<string, {
        action: string;
        reason: string;
        severity: string;
        reportTypes: ReportType[];
      }>();

      reportTypes.forEach(item => {
        if (item.meetsThreshold) {
          const key = `${item.suggestedAction}-${item.severity}`;
          if (!actionGroups.has(key)) {
            actionGroups.set(key, {
              action: item.suggestedAction,
              reason: item.message,
              severity: item.severity,
              reportTypes: []
            });
          }
          actionGroups.get(key)!.reportTypes.push(item.type);
        }
      });

      const suggestedActions = Array.from(actionGroups.values());
      const requiresImmediateAction = suggestedActions.some(a => a.severity === 'HIGH');

      return {
        success: true,
        analysis: {
          groupId: group.id,
          groupName: group.name,
          reportCount: group.reports.length,
          reportTypes: reportTypes.map(r => ({
            type: r.type,
            count: r.count,
            threshold: r.threshold,
            suggestedAction: r.suggestedAction,
            severity: r.severity,
            message: r.message,
            meetsThreshold: r.meetsThreshold
          })),
          suggestedActions,
          requiresImmediateAction
        }
      };

    } catch (error: any) {
      console.error('Error analyzing group reports:', error);
      return {
        success: false,
        message: error.message || 'Failed to analyze group reports'
      };
    }
  }

  // ========== GET GROUPS WITH REPORT ANALYSIS ==========
  static async getGroupsWithAnalysis(filters: GroupFilters = {}) {
    try {
      const groupsResult = await this.getGroups(filters);
      
      if (!groupsResult.success) {
        return groupsResult;
      }

      // Add report analysis to each group
      const groupsWithAnalysis = await Promise.all(
        (groupsResult.groups || []).map(async (group) => {
          const analysis = await this.analyzeGroupReports(group.id);
          return {
            ...group,
            reportAnalysis: analysis.success ? analysis.analysis : null
          };
        })
      );

      return {
        ...groupsResult,
        groups: groupsWithAnalysis
      };

    } catch (error: any) {
      console.error('Error getting groups with analysis:', error);
      return {
        success: false,
        message: error.message || 'Failed to fetch groups with analysis'
      };
    }
  }

  // ========== APPLY SUGGESTED ACTION ==========
  static async applySuggestedAction(
    groupId: string,
    action: string,
    adminId: string,
    reason?: string
  ) {
    try {
      const analysis = await this.analyzeGroupReports(groupId);
      
      if (!analysis.success || !analysis.analysis) {
        return {
          success: false,
          message: 'Could not analyze group reports'
        };
      }

      // Find matching suggested action
      const suggestedAction = analysis.analysis.suggestedActions.find(
        a => a.action === action
      );

      if (!suggestedAction) {
        return {
          success: false,
          message: `No suggested action "${action}" for this group`
        };
      }

      // Apply the action
      switch (action) {
        case 'SOFT_DELETE':
          return await this.deleteGroup(groupId, adminId, { 
            hardDelete: false,
            reason: reason || suggestedAction.reason
          });

        case 'HARD_DELETE':
          return await this.deleteGroup(groupId, adminId, { 
            hardDelete: true,
            reason: reason || suggestedAction.reason
          });

        case 'SUSPEND':
          return await this.suspendGroup(groupId, adminId, reason || suggestedAction.reason);

        case 'WARNING':
          return await this.sendGroupWarning(groupId, adminId, reason || suggestedAction.reason);

        case 'REVIEW':
          return await this.markGroupForReview(groupId, adminId, reason || suggestedAction.reason);

        default:
          return {
            success: false,
            message: `Unknown action: ${action}`
          };
      }

    } catch (error: any) {
      console.error('Error applying suggested action:', error);
      return {
        success: false,
        message: error.message || 'Failed to apply suggested action'
      };
    }
  }

  // ========== SUSPEND GROUP ==========
  static async suspendGroup(groupId: string, adminId: string, reason?: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true, createdById: true }
      });

      if (!group) {
        return {
          success: false,
          message: 'Group not found'
        };
      }

      // Create notification for group creator
      await prisma.userNotification.create({
        data: {
          userId: group.createdById,
          type: 'GROUP_SUSPENDED',
          title: '⚠️ Group Suspended',
          message: `Your group "${group.name}" has been suspended. Reason: ${reason || 'Violation of community guidelines'}`,
          data: {
            groupId,
            groupName: group.name,
            reason
          }
        }
      });

      // Create audit log
      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'GROUP_SUSPENDED',
          targetUserId: group.createdById,
          details: {
            groupId,
            groupName: group.name,
            reason
          }
        }
      });

      return {
        success: true,
        message: 'Group suspended successfully'
      };

    } catch (error: any) {
      console.error('Error suspending group:', error);
      return {
        success: false,
        message: error.message || 'Failed to suspend group'
      };
    }
  }

  // ========== SEND GROUP WARNING ==========
  static async sendGroupWarning(groupId: string, adminId: string, reason?: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true, createdById: true }
      });

      if (!group) {
        return {
          success: false,
          message: 'Group not found'
        };
      }

      // Create warning notification
      await prisma.userNotification.create({
        data: {
          userId: group.createdById,
          type: 'GROUP_WARNING',
          title: '⚠️ Group Warning',
          message: `Your group "${group.name}" has received a warning. Reason: ${reason || 'Multiple reports received'}`,
          data: {
            groupId,
            groupName: group.name,
            reason
          }
        }
      });

      // Create audit log
      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'GROUP_WARNING_SENT',
          targetUserId: group.createdById,
          details: {
            groupId,
            groupName: group.name,
            reason
          }
        }
      });

      return {
        success: true,
        message: 'Warning sent successfully'
      };

    } catch (error: any) {
      console.error('Error sending warning:', error);
      return {
        success: false,
        message: error.message || 'Failed to send warning'
      };
    }
  }

  // ========== MARK GROUP FOR REVIEW ==========
  static async markGroupForReview(groupId: string, adminId: string, reason?: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true, createdById: true }
      });

      if (!group) {
        return {
          success: false,
          message: 'Group not found'
        };
      }

      // Create notification for admins
      const admins = await prisma.systemAdmin.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      for (const admin of admins) {
        await prisma.adminNotification.create({
          data: {
            adminId: admin.id,
            type: 'GROUP_REVIEW_NEEDED',
            title: '🔍 Group Review Needed',
            message: `Group "${group.name}" needs review. Reason: ${reason || 'Multiple reports'}`,
            priority: 'MEDIUM',
            data: {
              groupId,
              groupName: group.name,
              reason
            }
          }
        });
      }

      // Create audit log
      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'GROUP_MARKED_FOR_REVIEW',
          targetUserId: group.createdById,
          details: {
            groupId,
            groupName: group.name,
            reason
          }
        }
      });

      return {
        success: true,
        message: 'Group marked for review'
      };

    } catch (error: any) {
      console.error('Error marking group for review:', error);
      return {
        success: false,
        message: error.message || 'Failed to mark group for review'
      };
    }
  }

  // ========== DELETE GROUP (SOFT DELETE OR HARD DELETE) ==========
  static async deleteGroup(
    groupId: string, 
    adminId: string,
    options: {
      hardDelete?: boolean;
      reason?: string;
    } = {}
  ) {
    try {
      const { hardDelete = false, reason } = options;

      // Check if group exists
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          _count: {
            select: {
              members: true,
              tasks: true
            }
          }
        }
      });

      if (!group) {
        return {
          success: false,
          message: 'Group not found'
        };
      }

      if (hardDelete) {
        // HARD DELETE - Actually delete from database
        await prisma.$transaction(async (tx) => {
          // Delete related records first
          await tx.assignment.deleteMany({
            where: {
              task: {
                groupId
              }
            }
          });

          await tx.timeSlot.deleteMany({
            where: {
              task: {
                groupId
              }
            }
          });

          await tx.task.deleteMany({
            where: { groupId }
          });

          await tx.groupMember.deleteMany({
            where: { groupId }
          });

          await tx.report.deleteMany({
            where: { groupId }
          });

          // Finally delete the group
          await tx.group.delete({
            where: { id: groupId }
          });
        });

        // Create audit log
        await prisma.adminAuditLog.create({
          data: {
            adminId,
            action: 'GROUP_HARD_DELETED',
            targetUserId: group.createdById,
            details: {
              groupId,
              groupName: group.name,
              memberCount: group._count.members,
              taskCount: group._count.tasks,
              reason
            }
          }
        });

        return {
          success: true,
          message: 'Group permanently deleted successfully'
        };
      } else {
        // SOFT DELETE - Archive the group
        const deletedName = `[DELETED] ${group.name} ${Date.now()}`;
        
        await prisma.group.update({
          where: { id: groupId },
          data: {
            name: deletedName,
            inviteCode: `deleted_${groupId.slice(0, 8)}`,
            description: '[This group has been deleted by admin]',
          }
        });

        // Remove all members
        await prisma.groupMember.deleteMany({
          where: { groupId }
        });

        // Archive tasks
        await prisma.task.updateMany({
          where: { groupId },
          data: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: adminId
          }
        });

        // Create audit log
        await prisma.adminAuditLog.create({
          data: {
            adminId,
            action: 'GROUP_SOFT_DELETED',
            targetUserId: group.createdById,
            details: {
              groupId,
              groupName: group.name,
              memberCount: group._count.members,
              taskCount: group._count.tasks,
              reason
            }
          }
        });

        return {
          success: true,
          message: 'Group deleted successfully'
        };
      }

    } catch (error: any) {
      console.error('Error deleting group:', error);
      return {
        success: false,
        message: error.message || 'Failed to delete group'
      };
    }
  }

  // ========== GET GROUP STATISTICS ==========
  static async getGroupStatistics(filters?: { 
    startDate?: Date; 
    endDate?: Date;
    minMembers?: number;
    maxMembers?: number;
  }) {
    try {
      const where: any = {};
      if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) where.createdAt.gte = filters.startDate;
        if (filters.endDate) where.createdAt.lte = filters.endDate;
      }

      // Get groups by size
      const allGroups = await prisma.group.findMany({
        select: {
          id: true,
          _count: {
            select: {
              members: true
            }
          }
        }
      });

      // Calculate size distribution
      const sizeDistribution = {
        '1-5': 0,
        '6-10': 0,
        '11-20': 0,
        '20+': 0
      };

      allGroups.forEach(group => {
        const memberCount = group._count.members;
        if (memberCount <= 5) sizeDistribution['1-5']++;
        else if (memberCount <= 10) sizeDistribution['6-10']++;
        else if (memberCount <= 20) sizeDistribution['11-20']++;
        else sizeDistribution['20+']++;
      });

      const sizeDistributionArray = Object.entries(sizeDistribution).map(([range, count]) => ({
        size_range: range,
        count
      }));

      const [
        totalGroups,
        activeGroups,
        recentGroups,
        topGroupsByMembers,
        topGroupsByTasks,
        groupsWithReports
      ] = await Promise.all([
        // Total groups
        prisma.group.count({ where }),
        
        // Active groups (groups with activity in last 7 days)
        prisma.group.count({
          where: {
            ...where,
            tasks: {
              some: {
                assignments: {
                  some: {
                    updatedAt: {
                      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    }
                  }
                }
              }
            }
          }
        }),

        // Recent groups (last 30 days)
        prisma.group.count({
          where: {
            ...where,
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            }
          }
        }),

        // Top groups by member count
        prisma.group.findMany({
          include: {
            _count: {
              select: {
                members: true
              }
            }
          },
          orderBy: {
            members: {
              _count: 'desc'
            }
          },
          take: 5
        }),

        // Top groups by task count
        prisma.group.findMany({
          include: {
            _count: {
              select: {
                tasks: {
                  where: {
                    isDeleted: false
                  }
                }
              }
            }
          },
          orderBy: {
            tasks: {
              _count: 'desc'
            }
          },
          take: 5
        }),

        // Groups with pending reports
        prisma.group.count({
          where: {
            reports: {
              some: {
                status: {
                  in: ['PENDING', 'REVIEWING']
                }
              }
            }
          }
        })
      ]);

      // Format the response
      const sizeDistributionFormatted = sizeDistributionArray.map(item => ({
        size_range: item.size_range,
        count: item.count
      }));

      return {
        success: true,
        statistics: {
          overview: {
            total: totalGroups,
            active: activeGroups,
            recent: recentGroups,
            withReports: groupsWithReports
          },
          sizeDistribution: sizeDistributionFormatted,
          topGroups: {
            byMembers: topGroupsByMembers.map(g => ({
              id: g.id,
              name: g.name,
              memberCount: (g as any)._count.members
            })),
            byTasks: topGroupsByTasks.map(g => ({
              id: g.id,
              name: g.name,
              taskCount: (g as any)._count.tasks
            }))
          }
        }
      };

    } catch (error: any) {
      console.error('Error fetching group statistics:', error);
      return {
        success: false,
        message: error.message || 'Failed to fetch group statistics'
      };
    }
  }

  // ========== GET GROUP MEMBERS WITH DETAILS ==========
  static async getGroupMembers(groupId: string, filters?: {
    role?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const {
        role,
        status,
        search,
        page = 1,
        limit = 20
      } = filters || {};

      const where: any = { groupId };

      if (role) {
        where.groupRole = role;
      }

      if (status) {
        where.user = {
          roleStatus: status
        };
      }

      if (search) {
        where.user = {
          ...where.user,
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } }
          ]
        };
      }

      const skip = (page - 1) * limit;

      const [members, total] = await Promise.all([
        prisma.groupMember.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                avatarUrl: true,
                roleStatus: true,
                createdAt: true,
                lastLoginAt: true,
                _count: {
                  select: {
                    assignments: {
                      where: {
                        completed: true,
                        verified: true
                      }
                    }
                  }
                }
              }
            }
          },
          orderBy: {
            joinedAt: 'desc'
          },
          skip,
          take: limit
        }),
        prisma.groupMember.count({ where })
      ]);

      // Get task completion stats for each member
      const membersWithStats = await Promise.all(
        members.map(async (member) => {
          const completedTasks = await prisma.assignment.count({
            where: {
              userId: member.userId,
              task: {
                groupId
              },
              completed: true,
              verified: true
            }
          });

          const totalTasks = await prisma.assignment.count({
            where: {
              userId: member.userId,
              task: {
                groupId
              }
            }
          });

          return {
            id: member.id,
            userId: member.userId,
            groupRole: member.groupRole,
            joinedAt: member.joinedAt,
            rotationOrder: member.rotationOrder,
            isActive: member.isActive,
            cumulativePoints: member.cumulativePoints,
            user: member.user,
            stats: {
              completedTasks,
              totalTasks,
              completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
            }
          };
        })
      );

      return {
        success: true,
        members: membersWithStats,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit)
        }
      };

    } catch (error: any) {
      console.error('Error fetching group members:', error);
      return {
        success: false,
        message: error.message || 'Failed to fetch group members'
      };
    }
  }

  // ========== REMOVE MEMBER FROM GROUP ==========
  static async removeMember(
    groupId: string,
    memberId: string,
    adminId: string,
    reason?: string
  ) {
    try {
      // Check if member exists
      const member = await prisma.groupMember.findUnique({
        where: { id: memberId },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true
            }
          },
          group: {
            select: {
              name: true,
              createdById: true
            }
          }
        }
      });

      if (!member) {
        return {
          success: false,
          message: 'Member not found'
        };
      }

      // Don't allow removing the creator if they're the only admin
      if (member.groupRole === 'ADMIN') {
        const adminCount = await prisma.groupMember.count({
          where: {
            groupId,
            groupRole: 'ADMIN'
          }
        });

        if (adminCount <= 1 && member.userId === member.group.createdById) {
          return {
            success: false,
            message: 'Cannot remove the last admin who is also the group creator'
          };
        }
      }

      // Remove member
      await prisma.groupMember.delete({
        where: { id: memberId }
      });

      // Create audit log
      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'GROUP_MEMBER_REMOVED',
          targetUserId: member.userId,
          details: {
            groupId,
            groupName: member.group.name,
            memberName: member.user.fullName,
            memberEmail: member.user.email,
            reason
          }
        }
      });

      return {
        success: true,
        message: 'Member removed successfully'
      };

    } catch (error: any) {
      console.error('Error removing member:', error);
      return {
        success: false,
        message: error.message || 'Failed to remove member'
      };
    }
  }

  // ========== BULK DELETE GROUPS ==========
  static async bulkDeleteGroups(
    groupIds: string[],
    adminId: string,
    options: {
      hardDelete?: boolean;
      reason?: string;
    } = {}
  ) {
    try {
      const results = [];
      
      for (const groupId of groupIds) {
        const result = await this.deleteGroup(groupId, adminId, options);
        results.push({
          groupId,
          success: result.success,
          message: result.message
        });
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      return {
        success: successCount > 0,
        message: `Bulk delete completed: ${successCount} succeeded, ${failCount} failed`,
        results
      };

    } catch (error: any) {
      console.error('Error in bulk delete:', error);
      return {
        success: false,
        message: error.message || 'Failed to perform bulk delete'
      };
    }
  }
}