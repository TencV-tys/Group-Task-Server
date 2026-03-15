// services/admin.groups.services.ts - CLEANED UP WITH RESTORE
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

// ===== REPORT ACTION RULES =====
const REPORT_ACTION_RULES = {
  [ReportType.INAPPROPRIATE_CONTENT]: {
    threshold: 2,
    suggestedAction: 'SOFT_DELETE',
    severity: 'MEDIUM',
    message: 'Multiple reports of inappropriate content',
  },
  [ReportType.HARASSMENT]: {
    threshold: 1,
    suggestedAction: 'SUSPEND',
    severity: 'HIGH',
    message: 'Harassment reported - immediate action required',
  },
  [ReportType.SPAM]: {
    threshold: 3,
    suggestedAction: 'SOFT_DELETE',
    severity: 'LOW',
    message: 'Multiple spam reports',
  },
  [ReportType.OFFENSIVE_BEHAVIOR]: {
    threshold: 2,
    suggestedAction: 'WARNING',
    severity: 'MEDIUM',
    message: 'Offensive behavior reported',
  },
  [ReportType.TASK_ABUSE]: {
    threshold: 2,
    suggestedAction: 'SOFT_DELETE',
    severity: 'MEDIUM',
    message: 'Task abuse detected',
  },
  [ReportType.GROUP_MISUSE]: {
    threshold: 2,
    suggestedAction: 'HARD_DELETE',
    severity: 'HIGH',
    message: 'Group misuse - permanent action recommended',
  },
  [ReportType.OTHER]: {
    threshold: 3,
    suggestedAction: 'REVIEW',
    severity: 'LOW',
    message: 'Multiple miscellaneous reports',
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
  
  // ========== GET ALL GROUPS ==========
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

      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (createdAfter || createdBefore) {
        where.createdAt = {};
        if (createdAfter) where.createdAt.gte = createdAfter;
        if (createdBefore) where.createdAt.lte = createdBefore;
      }

      const skip = (page - 1) * limit;

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
                  where: { isDeleted: false }
                },
                reports: {
                  where: { status: { in: ['PENDING', 'REVIEWING'] } }
                }
              }
            }
          },
          orderBy: { [sortBy]: sortOrder },
          skip,
          take: limit
        }),
        prisma.group.count({ where })
      ]);

      // Filter by member count if needed
      let filteredGroups = groups;
      if (minMembers !== undefined || maxMembers !== undefined) {
        filteredGroups = groups.filter(group => {
          const memberCount = group._count.members;
          if (minMembers !== undefined && memberCount < minMembers) return false;
          if (maxMembers !== undefined && memberCount > maxMembers) return false;
          return true;
        });
      }

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
        creator: group.creator,
        _count: group._count,
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

  // ========== GET GROUP BY ID ==========
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
          _count: {
            select: {
              members: true,
              tasks: { where: { isDeleted: false } },
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

      return {
        success: true,
        message: 'Group retrieved successfully',
        group
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
  // In services/admin.groups.services.ts - Add this to analyzeGroupReports

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

    // Check if group is soft-deleted
    const isSoftDeleted = group.name.startsWith('[DELETED]');

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

    // 👇 ADD RESTORE ACTION FOR SOFT-DELETED GROUPS
    if (isSoftDeleted) {
      actionGroups.set('RESTORE-LOW', {
        action: 'RESTORE',
        reason: 'Group is currently deleted. Restore to bring it back.',
        severity: 'LOW',
        reportTypes: []
      });
    }

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
  // ========== GET GROUPS WITH ANALYSIS ==========
  static async getGroupsWithAnalysis(filters: GroupFilters = {}) {
    try {
      const groupsResult = await this.getGroups(filters);
      
      if (!groupsResult.success) {
        return groupsResult;
      }

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

  // ========== APPLY ACTION ==========
  static async applyAction(
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

      const suggestedAction = analysis.analysis.suggestedActions.find(
        a => a.action === action
      );

      if (!suggestedAction) {
        return {
          success: false,
          message: `No suggested action "${action}" for this group`
        };
      }

      switch (action) {
        case 'SOFT_DELETE':
          return await this.deleteGroup(groupId, adminId, { hardDelete: false, reason: reason || suggestedAction.reason });

        case 'HARD_DELETE':
          return await this.deleteGroup(groupId, adminId, { hardDelete: true, reason: reason || suggestedAction.reason });

        case 'SUSPEND':
          return await this.suspendGroup(groupId, adminId, reason || suggestedAction.reason);

        case 'RESTORE':
          return await this.restoreGroup(groupId, adminId, reason);

        case 'WARNING':
          return await this.sendWarning(groupId, adminId, reason || suggestedAction.reason);

        default:
          return {
            success: false,
            message: `Unknown action: ${action}`
          };
      }

    } catch (error: any) {
      console.error('Error applying action:', error);
      return {
        success: false,
        message: error.message || 'Failed to apply action'
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
        return { success: false, message: 'Group not found' };
      }

      // Mark as suspended (you'll need to add a status field to Group model)
      await prisma.group.update({
        where: { id: groupId },
        data: {
          // Add status field when you add it to schema
          // status: 'SUSPENDED'
        }
      });

      await prisma.userNotification.create({
        data: {
          userId: group.createdById,
          type: 'GROUP_SUSPENDED',
          title: '⚠️ Group Suspended',
          message: `Your group "${group.name}" has been suspended. Reason: ${reason || 'Violation of guidelines'}`,
          data: { groupId, groupName: group.name, reason }
        }
      });

      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'GROUP_SUSPENDED',
          targetUserId: group.createdById,
          details: { groupId, groupName: group.name, reason }
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
// ========== RESTORE GROUP ==========
static async restoreGroup(groupId: string, adminId: string, reason?: string) {
  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        _count: {
          select: {
            tasks: true,
            members: true
          }
        }
      }
    });

    if (!group) {
      return { success: false, message: 'Group not found' };
    }

    // Extract original name (remove [DELETED] prefix and timestamp)
    let originalName = group.name
      .replace(/^\[DELETED\]\s*/, '')
      .replace(/\s+\d+$/, '')
      .trim();
    
    // If name becomes empty, use a default
    if (!originalName) {
      originalName = `Restored Group ${new Date().toLocaleDateString()}`;
    }

    // Generate new invite code (or restore original if you stored it)
    const newInviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Update the group
    await prisma.group.update({
      where: { id: groupId },
      data: {
        name: originalName,
        description: group.description?.replace('[This group has been deleted by admin]', '').trim() || null,
        inviteCode: newInviteCode,
        // Reset any other deleted flags
      }
    });

    // Restore tasks if they were soft-deleted
    await prisma.task.updateMany({
      where: { 
        groupId,
        isDeleted: true 
      },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedBy: null
      }
    });

    // Create notification for group creator
    await prisma.userNotification.create({
      data: {
        userId: group.createdById,
        type: 'GROUP_RESTORED',
        title: '✅ Group Restored',
        message: `Your group "${originalName}" has been restored. New invite code: ${newInviteCode}`,
        data: { groupId, groupName: originalName, newInviteCode, reason }
      }
    });

    // Create audit log
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'GROUP_RESTORED',
        targetUserId: group.createdById,
        details: { 
          groupId, 
          groupName: originalName, 
          oldName: group.name,
          newInviteCode,
          reason 
        }
      }
    });

    return {
      success: true,
      message: 'Group restored successfully',
      data: {
        id: groupId,
        name: originalName,
        inviteCode: newInviteCode
      }
    };

  } catch (error: any) {
    console.error('Error restoring group:', error);
    return {
      success: false,
      message: error.message || 'Failed to restore group'
    };
  }
}

  // ========== SEND WARNING ==========
  static async sendWarning(groupId: string, adminId: string, reason?: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true, createdById: true }
      });

      if (!group) {
        return { success: false, message: 'Group not found' };
      }

      await prisma.userNotification.create({
        data: {
          userId: group.createdById,
          type: 'GROUP_WARNING',
          title: '⚠️ Group Warning',
          message: `Your group "${group.name}" has received a warning. Reason: ${reason || 'Multiple reports'}`,
          data: { groupId, groupName: group.name, reason }
        }
      });

      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'GROUP_WARNING_SENT',
          targetUserId: group.createdById,
          details: { groupId, groupName: group.name, reason }
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

  // ========== DELETE GROUP ==========
  static async deleteGroup(
    groupId: string, 
    adminId: string,
    options: { hardDelete?: boolean; reason?: string; } = {}
  ) {
    try {
      const { hardDelete = false, reason } = options;

      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: { _count: { select: { members: true, tasks: true } } }
      });

      if (!group) {
        return { success: false, message: 'Group not found' };
      }

      if (hardDelete) {
        // HARD DELETE
        await prisma.$transaction(async (tx) => {
          await tx.assignment.deleteMany({ where: { task: { groupId } } });
          await tx.timeSlot.deleteMany({ where: { task: { groupId } } });
          await tx.task.deleteMany({ where: { groupId } });
          await tx.groupMember.deleteMany({ where: { groupId } });
          await tx.report.deleteMany({ where: { groupId } });
          await tx.group.delete({ where: { id: groupId } });
        });

        await prisma.adminAuditLog.create({
          data: {
            adminId,
            action: 'GROUP_HARD_DELETED',
            targetUserId: group.createdById,
            details: { groupId, groupName: group.name, memberCount: group._count.members, taskCount: group._count.tasks, reason }
          }
        });

        return { success: true, message: 'Group permanently deleted successfully' };
      } else {
        // SOFT DELETE
        const deletedName = `[DELETED] ${group.name} ${Date.now()}`;
        
        await prisma.group.update({
          where: { id: groupId },
          data: {
            name: deletedName,
            inviteCode: `deleted_${groupId.slice(0, 8)}`,
            description: '[This group has been deleted by admin]',
          }
        });

        await prisma.groupMember.deleteMany({ where: { groupId } });
        
        await prisma.task.updateMany({
          where: { groupId },
          data: { isDeleted: true, deletedAt: new Date(), deletedBy: adminId }
        });

        await prisma.adminAuditLog.create({
          data: {
            adminId,
            action: 'GROUP_SOFT_DELETED',
            targetUserId: group.createdById,
            details: { groupId, groupName: group.name, memberCount: group._count.members, taskCount: group._count.tasks, reason }
          }
        });

        return { success: true, message: 'Group soft deleted successfully' };
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
  static async getGroupStatistics() {
    try {
      const [totalGroups, groupsWithReports] = await Promise.all([
        prisma.group.count(),
        prisma.group.count({
          where: {
            reports: { some: { status: { in: ['PENDING', 'REVIEWING'] } } }
          }
        })
      ]);

      return {
        success: true,
        statistics: {
          overview: {
            total: totalGroups,
            withReports: groupsWithReports
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
}