// services/admin.groups.services.ts - COMPLETE WITH FIXED TYPES

import prisma from "../prisma";
import { ReportType, ReportStatus, GroupStatus, Prisma } from "@prisma/client";

export interface GroupFilters {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  minMembers?: 6;        // Only 6 allowed
  maxMembers?: 6 | 7 | 8 | 9 | 10;  // Only 6-10 allowed
  createdAfter?: Date;
  createdBefore?: Date;
  status?: GroupStatus;
  hasReports?: boolean;
  minReports?: number;
}

// Define which report types trigger which actions
export const REPORT_ACTIONS = {
  SUSPEND: {
    triggers: [
      ReportType.HARASSMENT,
      ReportType.OFFENSIVE_BEHAVIOR
    ] as ReportType[],
    severity: 'HIGH',
    message: 'Reports require immediate suspension'
  },
  SOFT_DELETE: {
    triggers: [
      ReportType.INAPPROPRIATE_CONTENT,
      ReportType.SPAM,
      ReportType.TASK_ABUSE
    ] as ReportType[],
    severity: 'MEDIUM',
    message: 'Reports suggest soft deletion'
  },
  HARD_DELETE: {
    triggers: [
      ReportType.GROUP_MISUSE
    ] as ReportType[],
    severity: 'HIGH',
    message: 'Reports require permanent deletion'
  },
  REVIEW: {
    triggers: [
      ReportType.OTHER
    ] as ReportType[],
    severity: 'LOW',
    message: 'Reports require review'
  }
};

// Thresholds for each report type
const REPORT_THRESHOLDS: Record<ReportType, number> = {
  [ReportType.INAPPROPRIATE_CONTENT]: 2,
  [ReportType.HARASSMENT]: 1,
  [ReportType.SPAM]: 3,
  [ReportType.OFFENSIVE_BEHAVIOR]: 2,
  [ReportType.TASK_ABUSE]: 2,
  [ReportType.GROUP_MISUSE]: 2,
  [ReportType.OTHER]: 3
};

export interface ReportAnalysis {
  groupId: string;
  groupName: string;
  groupStatus: GroupStatus;
  isDeleted: boolean;
  reportCount: number;
  reportTypes: {
    type: ReportType;
    count: number;
    threshold: number;
    meetsThreshold: boolean;
  }[];
  availableActions: {
    action: 'SUSPEND' | 'SOFT_DELETE' | 'HARD_DELETE' | 'RESTORE' | 'REVIEW';
    reason: string;
    severity: string;
    canExecute: boolean;
    reportTypes: ReportType[];
    thresholdMet: boolean;
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
        createdBefore,
        status,
        hasReports,
        minReports
      } = filters;

      // Validate member count - only 6 allowed for min, and 6-10 for max
      if (minMembers !== undefined && minMembers !== 6) {
        return {
          success: false,
          message: 'Minimum members can only be 6'
        };
      }

      if (maxMembers !== undefined && (maxMembers < 6 || maxMembers > 10)) {
        return {
          success: false,
          message: 'Maximum members must be between 6 and 10'
        };
      }

      const where: any = {};

      // Search filter
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Date filters
      if (createdAfter || createdBefore) {
        where.createdAt = {};
        if (createdAfter) where.createdAt.gte = createdAfter;
        if (createdBefore) where.createdAt.lte = createdBefore;
      }

      // Status filter
      if (status) {
        where.status = status;
      }

      // Reports filter
      if (hasReports !== undefined || minReports !== undefined) {
        where.reports = {
          some: {
            status: { in: ['PENDING', 'REVIEWING'] }
          }
        };
        
        if (minReports !== undefined) {
          where.reports = {
            ...where.reports,
            every: {
              status: { in: ['PENDING', 'REVIEWING'] }
            }
          };
        }
      }

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

      // Filter by member count if needed (after query since member count isn't in where)
      let filteredGroups = groups;
      if (minMembers !== undefined || maxMembers !== undefined) {
        filteredGroups = groups.filter(group => {
          const memberCount = group._count.members;
          if (minMembers !== undefined && memberCount < minMembers) return false;
          if (maxMembers !== undefined && memberCount > maxMembers) return false;
          return true;
        });
      }

      // Filter by min reports if needed
      if (minReports !== undefined) {
        filteredGroups = filteredGroups.filter(group => 
          group._count.reports >= minReports!
        );
      }

      const formattedGroups = filteredGroups.map(group => ({
        id: group.id,
        name: group.name,
        description: group.description,
        avatarUrl: group.avatarUrl,
        inviteCode: group.inviteCode,
        status: group.status,
        isDeleted: group.isDeleted,
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
          members: {
            take: 10,
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

      // Get task stats
      const taskStats = await prisma.task.aggregate({
        where: { 
          groupId,
          isDeleted: false 
        },
        _count: true
      });

      const completedTasks = await prisma.assignment.count({
        where: {
          task: { groupId },
          completed: true,
          verified: true
        }
      });

      return {
        success: true,
        message: 'Group retrieved successfully',
        group: {
          ...group,
          stats: {
            totalTasks: taskStats._count,
            completedTasks,
            completionRate: taskStats._count > 0 
              ? (completedTasks / taskStats._count) * 100 
              : 0
          }
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
        const threshold = REPORT_THRESHOLDS[type as ReportType] || 3;
        return {
          type: type as ReportType,
          count,
          threshold,
          meetsThreshold: count >= threshold
        };
      });

      // Determine available actions
      const availableActions = [];
      
      // Check SUSPEND action
      const suspendReports = reportTypes.filter(r => 
        (REPORT_ACTIONS.SUSPEND.triggers as ReportType[]).includes(r.type) && r.meetsThreshold
      );
      if (suspendReports.length > 0) {
        availableActions.push({
          action: 'SUSPEND' as const,
          reason: REPORT_ACTIONS.SUSPEND.message,
          severity: REPORT_ACTIONS.SUSPEND.severity,
          canExecute: true,
          reportTypes: suspendReports.map(r => r.type),
          thresholdMet: true
        });
      }

      // Check SOFT DELETE action
      const softDeleteReports = reportTypes.filter(r => 
        (REPORT_ACTIONS.SOFT_DELETE.triggers as ReportType[]).includes(r.type) && r.meetsThreshold
      );
      if (softDeleteReports.length > 0) {
        availableActions.push({
          action: 'SOFT_DELETE' as const,
          reason: REPORT_ACTIONS.SOFT_DELETE.message,
          severity: REPORT_ACTIONS.SOFT_DELETE.severity,
          canExecute: true,
          reportTypes: softDeleteReports.map(r => r.type),
          thresholdMet: true
        });
      }

      // Check HARD DELETE action
      const hardDeleteReports = reportTypes.filter(r => 
        (REPORT_ACTIONS.HARD_DELETE.triggers as ReportType[]).includes(r.type) && r.meetsThreshold
      );
      if (hardDeleteReports.length > 0) {
        availableActions.push({
          action: 'HARD_DELETE' as const,
          reason: REPORT_ACTIONS.HARD_DELETE.message,
          severity: REPORT_ACTIONS.HARD_DELETE.severity,
          canExecute: true,
          reportTypes: hardDeleteReports.map(r => r.type),
          thresholdMet: true
        });
      }

      // Check REVIEW action
      const reviewReports = reportTypes.filter(r => 
        (REPORT_ACTIONS.REVIEW.triggers as ReportType[]).includes(r.type) && r.meetsThreshold
      );
      if (reviewReports.length > 0) {
        availableActions.push({
          action: 'REVIEW' as const,
          reason: REPORT_ACTIONS.REVIEW.message,
          severity: REPORT_ACTIONS.REVIEW.severity,
          canExecute: true,
          reportTypes: reviewReports.map(r => r.type),
          thresholdMet: true
        });
      }

      // Add RESTORE action if group is deleted
      if (group.isDeleted || group.status === GroupStatus.DELETED) {
        availableActions.push({
          action: 'RESTORE' as const,
          reason: 'Group is currently deleted. Restore to bring it back.',
          severity: 'LOW',
          canExecute: true,
          reportTypes: [],
          thresholdMet: true
        });
      }

      const requiresImmediateAction = availableActions.some(
        a => a.severity === 'HIGH' && a.canExecute
      );

      return {
        success: true,
        analysis: {
          groupId: group.id,
          groupName: group.name,
          groupStatus: group.status,
          isDeleted: group.isDeleted,
          reportCount: group.reports.length,
          reportTypes,
          availableActions,
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
      // Get admin name for logs
      const admin = await prisma.systemAdmin.findUnique({
        where: { id: adminId },
        select: { fullName: true }
      });

      switch (action) {
        case 'SUSPEND':
          return await this.suspendGroup(groupId, adminId, admin?.fullName || 'Admin', reason);

        case 'SOFT_DELETE':
          return await this.deleteGroup(groupId, adminId, { 
            hardDelete: false, 
            reason: reason || 'Soft deleted due to reports' 
          });

        case 'HARD_DELETE':
          return await this.deleteGroup(groupId, adminId, { 
            hardDelete: true, 
            reason: reason || 'Hard deleted due to reports' 
          });

        case 'RESTORE':
          return await this.restoreGroup(groupId, adminId, admin?.fullName || 'Admin', reason);

        case 'REVIEW':
          return await this.markForReview(groupId, adminId, admin?.fullName || 'Admin', reason);

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
  static async suspendGroup(groupId: string, adminId: string, adminName: string, reason?: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { 
          name: true, 
          createdById: true,
          status: true,
          members: {
            select: { userId: true }
          }
        }
      });

      if (!group) {
        return { success: false, message: 'Group not found' };
      }

      // Check if already suspended
      if (group.status === GroupStatus.SUSPENDED) {
        return { success: false, message: 'Group is already suspended' };
      }

      // Update group with suspension
      await prisma.group.update({
        where: { id: groupId },
        data: {
          status: GroupStatus.SUSPENDED,
          statusChangedAt: new Date(),
          statusChangedBy: adminId,
          statusReason: reason || 'Violation of guidelines'
        }
      });

      // Notify group creator
      await prisma.userNotification.create({
        data: {
          userId: group.createdById,
          type: 'GROUP_SUSPENDED',
          title: '⚠️ Group Suspended',
          message: `Your group "${group.name}" has been suspended. Reason: ${reason || 'Violation of guidelines'}`,
          data: { 
            groupId, 
            groupName: group.name, 
            reason,
            suspendedBy: adminName
          }
        }
      });

      // Notify all group members
      for (const member of group.members) {
        if (member.userId !== group.createdById) {
          await prisma.userNotification.create({
            data: {
              userId: member.userId,
              type: 'GROUP_SUSPENDED',
              title: '⚠️ Group Suspended',
              message: `Group "${group.name}" has been suspended.`,
              data: { groupId, groupName: group.name, reason }
            }
          });
        }
      }

      // Create audit log
      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'GROUP_SUSPENDED',
          targetUserId: group.createdById,
          details: { 
            groupId, 
            groupName: group.name, 
            reason,
            suspendedBy: adminName
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

  // ========== RESTORE GROUP ==========
  static async restoreGroup(groupId: string, adminId: string, adminName: string, reason?: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          _count: {
            select: {
              tasks: true
            }
          },
          tasks: {
            where: { isDeleted: true },
            select: { id: true, title: true }
          }
        }
      });

      if (!group) {
        return { 
          success: false, 
          message: 'Group not found' 
        };
      }

      // Check if group is actually deleted
      if (!group.isDeleted && group.status !== GroupStatus.DELETED) {
        return { 
          success: false, 
          message: 'Group is not deleted. Only deleted groups can be restored.' 
        };
      }

      // Extract original name (remove [DELETED] prefix)
      let originalName = group.name
        .replace(/^\[DELETED\]\s*/, '')
        .replace(/\s+\d+$/, '')
        .trim();
      
      if (!originalName) {
        originalName = `Restored Group ${new Date().toLocaleDateString()}`;
      }

      // Check if name already exists
      const existingGroup = await prisma.group.findFirst({
        where: { 
          name: originalName,
          NOT: { id: groupId },
          isDeleted: false
        }
      });

      if (existingGroup) {
        originalName = `${originalName} (Restored)`;
      }

      // Generate new invite code
      const newInviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();

      // Update the group in a transaction
      await prisma.$transaction(async (tx) => {
        // Restore the group
        await tx.group.update({
          where: { id: groupId },
          data: {
            name: originalName,
            description: group.description?.replace('[This group has been deleted by admin]', '').trim() || null,
            inviteCode: newInviteCode,
            status: GroupStatus.ACTIVE,
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            deletedByName: null,
            deleteReason: null,
            statusChangedAt: new Date(),
            statusChangedBy: adminId,
            statusReason: reason || 'Group restored by admin'
          }
        });

        // Restore tasks
        if (group.tasks.length > 0) {
          await tx.task.updateMany({
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
        }
      });

      // Create notification for group creator
      await prisma.userNotification.create({
        data: {
          userId: group.createdById,
          title: '✅ Group Restored',
          message: `Your group "${originalName}" has been restored by ${adminName}. New invite code: ${newInviteCode}`,
          type: 'GROUP_RESTORED',
          data: { 
            groupId, 
            groupName: originalName, 
            newInviteCode, 
            reason,
            restoredBy: adminName
          }
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
            reason,
            restoredTasks: group.tasks.length,
            restoredBy: adminName
          }
        }
      });

      return {
        success: true,
        message: 'Group restored successfully',
        data: {
          id: groupId,
          name: originalName,
          inviteCode: newInviteCode,
          restoredTasks: group.tasks.length
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

  // ========== MARK FOR REVIEW ==========
  static async markForReview(groupId: string, adminId: string, adminName: string, reason?: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true, createdById: true }
      });

      if (!group) {
        return { success: false, message: 'Group not found' };
      }

      // Create admin notification for review
      await prisma.adminNotification.create({
        data: {
          type: 'GROUP_REVIEW_NEEDED',
          title: '👀 Group Needs Review',
          message: `Group "${group.name}" marked for review. Reason: ${reason || 'Multiple reports'}`,
          data: { groupId, groupName: group.name, reason },
          priority: 'HIGH'
        }
      });

      // Notify group creator
      await prisma.userNotification.create({
        data: {
          userId: group.createdById,
          type: 'GROUP_REVIEW',
          title: '📋 Group Under Review',
          message: `Your group "${group.name}" has been flagged for review by our team.`,
          data: { groupId, groupName: group.name, reason }
        }
      });

      // Create audit log
      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action: 'GROUP_MARKED_FOR_REVIEW',
          targetUserId: group.createdById,
          details: { groupId, groupName: group.name, reason }
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
        include: { 
          _count: { 
            select: { 
              members: true, 
              tasks: {
                where: { isDeleted: false }
              } 
            } 
          } 
        }
      });

      if (!group) {
        return { success: false, message: 'Group not found' };
      }

      // Get admin name
      const admin = await prisma.systemAdmin.findUnique({
        where: { id: adminId },
        select: { fullName: true }
      });

      if (hardDelete) {
        // HARD DELETE - complete removal
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
            details: { 
              groupId, 
              groupName: group.name, 
              memberCount: group._count.members, 
              taskCount: group._count.tasks, 
              reason,
              deletedBy: admin?.fullName || 'Admin'
            }
          }
        });

        return { 
          success: true, 
          message: 'Group permanently deleted successfully' 
        };
      } else {
        // SOFT DELETE
        const deletedName = `[DELETED] ${group.name} ${Date.now()}`;
        
        await prisma.$transaction(async (tx) => {
          // Update group with soft delete fields
          await tx.group.update({
            where: { id: groupId },
            data: {
              name: deletedName,
              inviteCode: `deleted_${groupId.slice(0, 8)}`,
              description: '[This group has been deleted by admin]',
              status: GroupStatus.DELETED,
              isDeleted: true,
              deletedAt: new Date(),
              deletedBy: adminId,
              deletedByName: admin?.fullName || 'Admin',
              deleteReason: reason || 'No reason provided',
              statusChangedAt: new Date(),
              statusChangedBy: adminId,
              statusReason: reason || 'Group soft deleted'
            }
          });

          // Remove all members
          await tx.groupMember.deleteMany({ 
            where: { groupId } 
          });
          
          // Soft delete tasks
          await tx.task.updateMany({
            where: { groupId },
            data: { 
              isDeleted: true, 
              deletedAt: new Date(), 
              deletedBy: adminId 
            }
          });
        });

        // Notify creator
        await prisma.userNotification.create({
          data: {
            userId: group.createdById,
            type: 'GROUP_DELETED',
            title: '🗑️ Group Deleted',
            message: `Your group "${group.name}" has been deleted. Reason: ${reason || 'Violation of guidelines'}`,
            data: { groupId, groupName: group.name, reason }
          }
        });

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
              reason,
              deletedBy: admin?.fullName || 'Admin'
            }
          }
        });

        return { 
          success: true, 
          message: 'Group soft deleted successfully' 
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
  static async getGroupStatistics() {
    try {
      const [totalGroups, groupsWithReports, activeGroups, suspendedGroups, deletedGroups] = await Promise.all([
        prisma.group.count(),
        prisma.group.count({
          where: {
            reports: { 
              some: { 
                status: { in: ['PENDING', 'REVIEWING'] } 
              } 
            }
          }
        }),
        prisma.group.count({
          where: { status: GroupStatus.ACTIVE, isDeleted: false }
        }),
        prisma.group.count({
          where: { status: GroupStatus.SUSPENDED }
        }),
        prisma.group.count({
          where: { 
            OR: [
              { status: GroupStatus.DELETED },
              { isDeleted: true }
            ]
          }
        })
      ]);

      // Get groups by member count ranges - FIXED TYPE ISSUE
      const groupsByMemberCountResult = await prisma.$queryRaw<Array<{
        exactly_6: bigint;
        exactly_7: bigint;
        exactly_8: bigint;
        exactly_9: bigint;
        exactly_10: bigint;
      }>>`
        SELECT 
          COUNT(CASE WHEN member_count = 6 THEN 1 END) as exactly_6,
          COUNT(CASE WHEN member_count = 7 THEN 1 END) as exactly_7,
          COUNT(CASE WHEN member_count = 8 THEN 1 END) as exactly_8, 
          COUNT(CASE WHEN member_count = 9 THEN 1 END) as exactly_9,
          COUNT(CASE WHEN member_count = 10 THEN 1 END) as exactly_10
        FROM (
          SELECT g.id, COUNT(gm.id) as member_count
          FROM groups g
          LEFT JOIN group_members gm ON g.id = gm.group_id
          WHERE g.isDeleted = false
          GROUP BY g.id
        ) as member_counts
      `;

      // Parse the result
      const groupsByMemberCount = groupsByMemberCountResult[0] || {
        exactly_6: BigInt(0),
        exactly_7: BigInt(0),
        exactly_8: BigInt(0),
        exactly_9: BigInt(0),
        exactly_10: BigInt(0)
      };

      return {
        success: true,
        statistics: {
          overview: {
            total: totalGroups,
            withReports: groupsWithReports,
            active: activeGroups,
            suspended: suspendedGroups,
            deleted: deletedGroups
          },
          byMemberCount: {
            exactly_6: Number(groupsByMemberCount.exactly_6),
            exactly_7: Number(groupsByMemberCount.exactly_7),
            exactly_8: Number(groupsByMemberCount.exactly_8),
            exactly_9: Number(groupsByMemberCount.exactly_9),
            exactly_10: Number(groupsByMemberCount.exactly_10)
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