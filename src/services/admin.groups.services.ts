// services/admin.groups.service.ts - COMPLETE FIXED VERSION
import prisma from "../prisma";
import { ReportType, ReportStatus, GroupStatus, Prisma } from "@prisma/client";
import { SocketService } from "./socket.services";

export interface GroupFilters {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  minMembers?: 6;
  maxMembers?: 6 | 7 | 8 | 9 | 10; 
  createdAfter?: Date;
  createdBefore?: Date;
  status?: GroupStatus;
  hasReports?: boolean;
  minReports?: number;
}

// ✅ SIMPLIFIED COUNT-BASED THRESHOLDS
export const REPORT_COUNT_THRESHOLDS = {
  SUSPEND: 3,      // 3-5 reports = SUSPEND
  SOFT_DELETE: 6,  // 6-9 reports = SOFT_DELETE  
  HARD_DELETE: 10  // 10+ reports = HARD_DELETE
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
  }[];
  availableActions: {
    action: 'SUSPEND' | 'SOFT_DELETE' | 'HARD_DELETE' | 'RESTORE' | 'REVIEW';
    reason: string;
    severity: string;
    canExecute: boolean;
    reportCount: number;
  }[];
  requiresImmediateAction: boolean;
}

export class AdminGroupsService {
  
 // ========== GET ALL GROUPS WITH FILTERS (FIXED FOR MySQL) ==========
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

    // Validation
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

    // ✅ FIXED SEARCH FOR MySQL - Remove 'mode' and use case-insensitive via Prisma
    if (search && search.trim()) {
      // For MySQL, Prisma uses case-insensitive by default for string contains
      where.OR = [
        { name: { contains: search.trim() } },
        { description: { contains: search.trim() } },
        { inviteCode: { contains: search.trim() } },
      ];
    }

    if (createdAfter || createdBefore) {
      where.createdAt = {};
      if (createdAfter) where.createdAt.gte = createdAfter;
      if (createdBefore) where.createdAt.lte = createdBefore;
    }

    if (status) {
      if (status === 'DELETED') {
        where.isDeleted = true;
      } else {
        where.status = status;
        where.isDeleted = false;
      }
    }

    if (hasReports === true) {
      where.reports = {
        some: {
          status: { in: ['PENDING', 'REVIEWING'] }
        }
      };
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

    // Rest of the function remains the same...
    let filteredGroups = groups;
    if (minMembers !== undefined || maxMembers !== undefined) {
      filteredGroups = groups.filter(group => {
        const memberCount = group._count.members;
        if (minMembers !== undefined && memberCount < minMembers) return false;
        if (maxMembers !== undefined && memberCount > maxMembers) return false;
        return true;
      });
    }

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
        total: total,
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

  // ========== ANALYZE GROUP REPORTS (COUNT-BASED) ==========
  static async analyzeGroupReports(groupId: string): Promise<{
    success: boolean;
    analysis?: ReportAnalysis;
    message?: string;
  }> {
    try {
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

      const totalReportCount = group.reports.length;
      
      const reportCountByType = new Map<ReportType, number>();
      group.reports.forEach(report => {
        const count = reportCountByType.get(report.type as ReportType) || 0;
        reportCountByType.set(report.type as ReportType, count + 1);
      });

      const reportTypes = Array.from(reportCountByType.entries()).map(([type, count]) => ({
        type: type as ReportType,
        count
      }));

      const availableActions = [];
      
      if (totalReportCount > 0 && totalReportCount < REPORT_COUNT_THRESHOLDS.SUSPEND) {
        availableActions.push({
          action: 'REVIEW' as const,
          reason: `This group has ${totalReportCount} report(s). Manual review recommended.`,
          severity: 'LOW',
          canExecute: true,
          reportCount: totalReportCount
        });
      }
      
      if (totalReportCount >= REPORT_COUNT_THRESHOLDS.SUSPEND && 
          totalReportCount < REPORT_COUNT_THRESHOLDS.SOFT_DELETE) {
        availableActions.push({
          action: 'SUSPEND' as const,
          reason: `This group has received ${totalReportCount} report(s). Suspension is recommended.`,
          severity: 'MEDIUM',
          canExecute: true,
          reportCount: totalReportCount
        });
      }
      
      if (totalReportCount >= REPORT_COUNT_THRESHOLDS.SOFT_DELETE && 
          totalReportCount < REPORT_COUNT_THRESHOLDS.HARD_DELETE) {
        availableActions.push({
          action: 'SOFT_DELETE' as const,
          reason: `This group has received ${totalReportCount} report(s). Soft deletion is recommended.`,
          severity: 'HIGH',
          canExecute: true,
          reportCount: totalReportCount
        });
      }
      
      if (totalReportCount >= REPORT_COUNT_THRESHOLDS.HARD_DELETE) {
        availableActions.push({
          action: 'HARD_DELETE' as const,
          reason: `This group has received ${totalReportCount} report(s). Permanent deletion is recommended.`,
          severity: 'CRITICAL',
          canExecute: true,
          reportCount: totalReportCount
        });
      }

      if (group.isDeleted || group.status === GroupStatus.DELETED) {
        availableActions.push({
          action: 'RESTORE' as const,
          reason: 'Group is currently deleted. Restore to bring it back.',
          severity: 'LOW',
          canExecute: true,
          reportCount: totalReportCount
        });
      }

      // ✅ FIX: Also show RESTORE for suspended groups
      if (group.status === GroupStatus.SUSPENDED && !group.isDeleted) {
        availableActions.push({
          action: 'RESTORE' as const,
          reason: 'Group is currently suspended. Restore to unsuspend it.',
          severity: 'LOW',
          canExecute: true,
          reportCount: totalReportCount
        });
      }

      const requiresImmediateAction = availableActions.some(
        a => a.severity === 'CRITICAL' || a.severity === 'HIGH'
      );

      return {
        success: true,
        analysis: {
          groupId: group.id,
          groupName: group.name,
          groupStatus: group.status,
          isDeleted: group.isDeleted,
          reportCount: totalReportCount,
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

  static async getGroupsWithAnalysis(filters: GroupFilters = {}) {
    try {
      const groupsResult = await this.getGroups(filters);
      if (!groupsResult.success || !groupsResult.groups) return groupsResult;

      const groupIds = groupsResult.groups.map(g => g.id);

      const reportCounts = await prisma.report.groupBy({
        by: ['groupId'],
        where: {
          groupId: { in: groupIds },
          status: { in: ['PENDING', 'REVIEWING'] }
        },
        _count: { id: true }
      });

      const reportCountMap = new Map<string, number>();
      for (const row of reportCounts) {
        reportCountMap.set(row.groupId, row._count.id);
      }

      const reportTypeCounts = await prisma.report.groupBy({
        by: ['groupId', 'type'],
        where: {
          groupId: { in: groupIds },
          status: { in: ['PENDING', 'REVIEWING'] }
        },
        _count: { id: true }
      });

      const reportTypeMap = new Map<string, Map<string, number>>();
      for (const row of reportTypeCounts) {
        if (!reportTypeMap.has(row.groupId)) reportTypeMap.set(row.groupId, new Map());
        reportTypeMap.get(row.groupId)!.set(row.type, row._count.id);
      }

      const groupsWithAnalysis = groupsResult.groups.map(group => {
        const reportCount = reportCountMap.get(group.id) || 0;
        const typeCounts = reportTypeMap.get(group.id) || new Map<string, number>();
        
        const reportTypes = Array.from(typeCounts.entries()).map(([type, count]) => ({
          type: type as ReportType,
          count
        }));

        const availableActions: ReportAnalysis['availableActions'] = [];
        
        if (reportCount > 0 && reportCount < REPORT_COUNT_THRESHOLDS.SUSPEND) {
          availableActions.push({
            action: 'REVIEW',
            reason: `${reportCount} report(s) received. Manual review recommended.`,
            severity: 'LOW',
            canExecute: true,
            reportCount
          });
        }
        
        if (reportCount >= REPORT_COUNT_THRESHOLDS.SUSPEND && 
            reportCount < REPORT_COUNT_THRESHOLDS.SOFT_DELETE) {
          availableActions.push({
            action: 'SUSPEND',
            reason: `${reportCount} report(s) received. Suspension recommended.`,
            severity: 'MEDIUM',
            canExecute: true,
            reportCount
          });
        }
        
        if (reportCount >= REPORT_COUNT_THRESHOLDS.SOFT_DELETE && 
            reportCount < REPORT_COUNT_THRESHOLDS.HARD_DELETE) {
          availableActions.push({
            action: 'SOFT_DELETE',
            reason: `${reportCount} report(s) received. Soft deletion recommended.`,
            severity: 'HIGH',
            canExecute: true,
            reportCount
          });
        }
        
        if (reportCount >= REPORT_COUNT_THRESHOLDS.HARD_DELETE) {
          availableActions.push({
            action: 'HARD_DELETE',
            reason: `${reportCount} report(s) received. Permanent deletion recommended.`,
            severity: 'CRITICAL',
            canExecute: true,
            reportCount
          });
        }

        if (group.isDeleted || group.status === GroupStatus.DELETED) {
          availableActions.push({
            action: 'RESTORE',
            reason: 'Group is currently deleted.',
            severity: 'LOW',
            canExecute: true,
            reportCount
          });
        }

        if (group.status === GroupStatus.SUSPENDED && !group.isDeleted) {
          availableActions.push({
            action: 'RESTORE',
            reason: 'Group is currently suspended. Unsuspend to bring it back.',
            severity: 'LOW',
            canExecute: true,
            reportCount
          });
        }

        const analysis: ReportAnalysis = {
          groupId: group.id,
          groupName: group.name,
          groupStatus: group.status,
          isDeleted: group.isDeleted,
          reportCount,
          reportTypes,
          availableActions,
          requiresImmediateAction: availableActions.some(a => a.severity === 'CRITICAL' || a.severity === 'HIGH')
        };

        return { ...group, reportAnalysis: analysis };
      });

      return { ...groupsResult, groups: groupsWithAnalysis };

    } catch (error: any) {
      console.error('Error getting groups with analysis:', error);
      return { success: false, message: error.message || 'Failed to fetch groups with analysis' };
    }
  }

  // ========== APPLY ACTION WITH REAL-TIME ==========
  static async applyAction(
    groupId: string,
    action: string,
    adminId: string,
    reason?: string
  ) {
    try {
      const admin = await prisma.systemAdmin.findUnique({
        where: { id: adminId },
        select: { fullName: true, email: true }
      });

      let result;
      switch (action) {
        case 'SUSPEND':
          result = await this.suspendGroup(groupId, adminId, admin?.fullName || 'Admin', reason);
          if (result.success) {
            await this.emitGroupSuspended(groupId, adminId, admin?.fullName || 'Admin', reason);
          }
          break;

        case 'SOFT_DELETE':
          result = await this.deleteGroup(groupId, adminId, { 
            hardDelete: false, 
            reason: reason || 'Soft deleted due to reports' 
          });
          if (result.success) {
            await this.emitGroupDeleted(groupId, adminId, admin?.fullName || 'Admin', false, reason);
          }
          break;

        case 'HARD_DELETE':
          result = await this.deleteGroup(groupId, adminId, { 
            hardDelete: true, 
            reason: reason || 'Hard deleted due to reports' 
          });
          if (result.success) {
            await this.emitGroupDeleted(groupId, adminId, admin?.fullName || 'Admin', true, reason);
          }
          break;

        case 'RESTORE':
          result = await this.restoreGroup(groupId, adminId, admin?.fullName || 'Admin', reason);
          if (result.success) {
            await this.emitGroupRestored(groupId, adminId, admin?.fullName || 'Admin', result.data);
          }
          break;

        case 'REVIEW':
          result = await this.markForReview(groupId, adminId, admin?.fullName || 'Admin', reason);
          if (result.success) {
            await this.emitGroupMarkedForReview(groupId, adminId, admin?.fullName || 'Admin', reason);
          }
          break;

        default:
          return {
            success: false,
            message: `Unknown action: ${action}`
          };
      }

      return result;

    } catch (error: any) {
      console.error('Error applying action:', error);
      return {
        success: false,
        message: error.message || 'Failed to apply action'
      };
    }
  }

  // ========== REAL-TIME EMIT METHODS ==========
  
  private static async emitGroupSuspended(groupId: string, adminId: string, adminName: string, reason?: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: { select: { userId: true } }
        }
      });

      if (!group) return;

      const payload = {
        groupId,
        groupName: group.name,
        action: 'SUSPENDED',
        adminId,
        adminName,
        reason: reason || 'Violation of guidelines',
        timestamp: new Date()
      };

      const memberIds = group.members.map(m => m.userId);
      if (memberIds.length > 0) {
        await SocketService.emitBulkNotifications(
          memberIds,
          `group_${groupId}_suspended`,
          'GROUP_SUSPENDED',
          '⚠️ Group Suspended',
          `Group "${group.name}" has been suspended. ${reason ? `Reason: ${reason}` : ''}`,
          payload
        );
      }

      const admins = await prisma.systemAdmin.findMany({
        where: { isActive: true },
        select: { id: true }
      });
      
      await SocketService.emitBulkNotifications(
        admins.map(a => a.id),
        `group_${groupId}_suspended_admin`,
        'GROUP_ADMIN_ACTION',
        'Group Suspended',
        `Group "${group.name}" was suspended by ${adminName}`,
        payload
      );

      console.log(`📢 Emitted group suspended event for ${groupId}`);
    } catch (error) {
      console.error('Error emitting group suspended:', error);
    }
  }

  private static async emitGroupDeleted(groupId: string, adminId: string, adminName: string, hardDelete: boolean, reason?: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: { select: { userId: true } }
        }
      });

      if (!group) return;

      const payload = {
        groupId,
        groupName: group.name,
        action: hardDelete ? 'HARD_DELETED' : 'SOFT_DELETED',
        adminId,
        adminName,
        reason: reason || 'Violation of guidelines',
        hardDelete,
        timestamp: new Date()
      };

      const memberIds = group.members.map(m => m.userId);
      if (memberIds.length > 0) {
        await SocketService.emitBulkNotifications(
          memberIds,
          `group_${groupId}_deleted`,
          'GROUP_DELETED',
          hardDelete ? '🗑️ Group Permanently Deleted' : '📋 Group Deleted',
          `Group "${group.name}" has been ${hardDelete ? 'permanently deleted' : 'deleted'}. ${reason ? `Reason: ${reason}` : ''}`,
          payload
        );
      }

      const admins = await prisma.systemAdmin.findMany({
        where: { isActive: true },
        select: { id: true }
      });
      
      await SocketService.emitBulkNotifications(
        admins.map(a => a.id),
        `group_${groupId}_deleted_admin`,
        'GROUP_ADMIN_ACTION',
        hardDelete ? 'Group Hard Deleted' : 'Group Soft Deleted',
        `Group "${group.name}" was ${hardDelete ? 'permanently deleted' : 'soft deleted'} by ${adminName}`,
        payload
      );

      console.log(`📢 Emitted group ${hardDelete ? 'hard' : 'soft'} deleted event for ${groupId}`);
    } catch (error) {
      console.error('Error emitting group deleted:', error);
    }
  }

  private static async emitGroupRestored(groupId: string, adminId: string, adminName: string, data?: any) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: { select: { userId: true } }
        }
      });

      if (!group) return;

      const payload = {
        groupId,
        groupName: group.name,
        action: 'RESTORED',
        adminId,
        adminName,
        newInviteCode: data?.inviteCode,
        wasSuspended: data?.wasSuspended,
        timestamp: new Date()
      };

      await SocketService.emitNewNotification(
        group.createdById,
        `group_${groupId}_restored`,
        'GROUP_RESTORED',
        data?.wasSuspended ? '✅ Group Unsuspended' : '✅ Group Restored',
        data?.wasSuspended 
          ? `Your group "${group.name}" has been unsuspended by ${adminName}.`
          : `Your group has been restored by ${adminName}. New invite code: ${data?.inviteCode || 'Check group settings'}`,
        payload
      );

      const admins = await prisma.systemAdmin.findMany({
        where: { isActive: true },
        select: { id: true }
      });
      
      await SocketService.emitBulkNotifications(
        admins.map(a => a.id),
        `group_${groupId}_restored_admin`,
        'GROUP_ADMIN_ACTION',
        data?.wasSuspended ? 'Group Unsuspended' : 'Group Restored',
        `Group "${group.name}" was ${data?.wasSuspended ? 'unsuspended' : 'restored'} by ${adminName}`,
        payload
      );

      console.log(`📢 Emitted group restored event for ${groupId}`);
    } catch (error) {
      console.error('Error emitting group restored:', error);
    }
  }

  private static async emitGroupMarkedForReview(groupId: string, adminId: string, adminName: string, reason?: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true, createdById: true }
      });

      if (!group) return;

      const payload = {
        groupId,
        groupName: group.name,
        action: 'MARKED_FOR_REVIEW',
        adminId,
        adminName,
        reason: reason || 'Multiple reports',
        timestamp: new Date()
      };

      await SocketService.emitNewNotification(
        group.createdById,
        `group_${groupId}_review`,
        'GROUP_REVIEW',
        '📋 Group Under Review',
        `Your group "${group.name}" has been flagged for review. ${reason ? `Reason: ${reason}` : ''}`,
        payload
      );

      const admins = await prisma.systemAdmin.findMany({
        where: { isActive: true },
        select: { id: true }
      });
      
      await SocketService.emitBulkNotifications(
        admins.map(a => a.id),
        `group_${groupId}_review_admin`,
        'GROUP_ADMIN_ACTION',
        'Group Needs Review',
        `Group "${group.name}" was marked for review by ${adminName}`,
        payload
      );

      console.log(`📢 Emitted group marked for review event for ${groupId}`);
    } catch (error) {
      console.error('Error emitting group marked for review:', error);
    }
  }

  // ========== SUSPEND GROUP (FIXED) ==========
  static async suspendGroup(groupId: string, adminId: string, adminName: string, reason?: string) {
    try {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { 
          name: true, 
          createdById: true,
          status: true,
          isDeleted: true,
          members: {
            select: { userId: true }
          }
        }
      });

      if (!group) {
        return { success: false, message: 'Group not found' };
      }

      // ✅ FIX 2: Can't suspend deleted groups
      if (group.isDeleted) {
        return { success: false, message: 'Cannot suspend a deleted group. Restore it first.' };
      }

      // ✅ FIX 3: If already suspended, just update the reason
      if (group.status === GroupStatus.SUSPENDED) {
        await prisma.group.update({
          where: { id: groupId },
          data: {
            statusChangedAt: new Date(),
            statusChangedBy: adminId,
            statusReason: reason || 'Group re-suspended'
          }
        });
        return {
          success: true,
          message: 'Group suspension updated successfully'
        };
      }

      // Suspend the group
      await prisma.group.update({
        where: { id: groupId },
        data: {
          status: GroupStatus.SUSPENDED,
          statusChangedAt: new Date(),
          statusChangedBy: adminId,
          statusReason: reason || 'Violation of guidelines'
        }
      });

      // Notify creator
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

      // Notify all members
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

      // Audit log
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

  // ========== RESTORE GROUP (FIXED - WORKS FOR BOTH SUSPENDED AND DELETED) ==========
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

      const isSuspended = group.status === GroupStatus.SUSPENDED;
      const isDeleted = group.isDeleted || group.status === GroupStatus.DELETED;

      // ✅ FIX 4: Allow restore for BOTH suspended AND deleted groups
      if (!isSuspended && !isDeleted) {
        return { 
          success: false, 
          message: 'Group is active. Only suspended or deleted groups can be restored.' 
        };
      }

      let originalName = group.name;
      let newInviteCode = group.inviteCode;
      let restoredTasksCount = 0;

      // If deleted, restore name and invite code
      if (isDeleted) {
        originalName = group.name
          .replace(/^\[DELETED\]\s*/, '')
          .replace(/\s+\d+$/, '')
          .trim();
        
        if (!originalName) {
          originalName = `Restored Group ${new Date().toLocaleDateString()}`;
        }

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

        newInviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        restoredTasksCount = group.tasks.length;
      }

      // Update group - clear suspension AND deletion
      await prisma.$transaction(async (tx) => {
        const updateData: any = {
          status: GroupStatus.ACTIVE,
          statusChangedAt: new Date(),
          statusChangedBy: adminId,
          statusReason: reason || `Group ${isSuspended ? 'unsuspended' : 'restored'} by admin`
        };

        // Only restore deleted fields if it was deleted
        if (isDeleted) {
          updateData.name = originalName;
          updateData.inviteCode = newInviteCode;
          updateData.description = group.description?.replace('[This group has been deleted by admin]', '').trim() || null;
          updateData.isDeleted = false;
          updateData.deletedAt = null;
          updateData.deletedBy = null;
          updateData.deletedByName = null;
          updateData.deleteReason = null;
        }

        await tx.group.update({
          where: { id: groupId },
          data: updateData
        });

        // Only restore tasks if it was deleted
        if (isDeleted && group.tasks.length > 0) {
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

      // Notify creator
      await prisma.userNotification.create({
        data: {
          userId: group.createdById,
          title: isSuspended ? '✅ Group Unsuspended' : '✅ Group Restored',
          message: isSuspended 
            ? `Your group "${group.name}" has been unsuspended by ${adminName}. Group features are now available again.`
            : `Your group "${originalName}" has been restored by ${adminName}. New invite code: ${newInviteCode}`,
          type: isSuspended ? 'GROUP_UNSUSPENDED' : 'GROUP_RESTORED',
          data: { 
            groupId, 
            groupName: isSuspended ? group.name : originalName, 
            ...(!isSuspended && { newInviteCode }),
            reason,
            restoredBy: adminName,
            wasSuspended: isSuspended,
            wasDeleted: isDeleted
          }
        }
      });

      // Notify all members if group was suspended
      if (isSuspended) {
        const members = await prisma.groupMember.findMany({
          where: { groupId },
          select: { userId: true }
        });
        
        for (const member of members) {
          if (member.userId !== group.createdById) {
            await prisma.userNotification.create({
              data: {
                userId: member.userId,
                type: 'GROUP_UNSUSPENDED',
                title: '✅ Group Unsuspended',
                message: `Group "${group.name}" has been unsuspended and is now active again.`,
                data: { groupId, groupName: group.name, reason }
              }
            });
          }
        }
      }

      // Audit log
      await prisma.adminAuditLog.create({
        data: {
          adminId,
          action: isSuspended ? 'GROUP_UNSUSPENDED' : 'GROUP_RESTORED',
          targetUserId: group.createdById,
          details: { 
            groupId, 
            groupName: isSuspended ? group.name : originalName,
            oldStatus: isSuspended ? 'SUSPENDED' : 'DELETED',
            newStatus: 'ACTIVE',
            reason,
            restoredBy: adminName,
            restoredTasks: restoredTasksCount,
            wasSuspended: isSuspended,
            wasDeleted: isDeleted
          }
        }
      });

      return {
        success: true,
        message: isSuspended ? 'Group unsuspended successfully' : 'Group restored successfully',
        data: {
          id: groupId,
          name: isSuspended ? group.name : originalName,
          inviteCode: isSuspended ? group.inviteCode : newInviteCode,
          restoredTasks: restoredTasksCount,
          wasSuspended: isSuspended,
          wasDeleted: isDeleted
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

      await prisma.adminNotification.create({
        data: {
          type: 'GROUP_REVIEW_NEEDED',
          title: '👀 Group Needs Review',
          message: `Group "${group.name}" marked for review. Reason: ${reason || 'Multiple reports'}`,
          data: { groupId, groupName: group.name, reason },
          priority: 'HIGH'
        }
      });

      await prisma.userNotification.create({
        data: {
          userId: group.createdById,
          type: 'GROUP_REVIEW',
          title: '📋 Group Under Review',
          message: `Your group "${group.name}" has been flagged for review by our team.`,
          data: { groupId, groupName: group.name, reason }
        }
      });

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

      const admin = await prisma.systemAdmin.findUnique({
        where: { id: adminId },
        select: { fullName: true }
      });

      if (hardDelete) {
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
        const deletedName = `[DELETED] ${group.name} ${Date.now()}`;
        
        await prisma.$transaction(async (tx) => {
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

          await tx.groupMember.deleteMany({ 
            where: { groupId } 
          });
          
          await tx.task.updateMany({
            where: { groupId },
            data: { 
              isDeleted: true, 
              deletedAt: new Date(), 
              deletedBy: adminId 
            }
          });
        });

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
          LEFT JOIN group_members gm ON g.id = gm.groupId
          WHERE g.isDeleted = false
          GROUP BY g.id
        ) as member_counts
      `;

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

  // ========== HELPER METHODS ==========
  static isGroupDeleted(group: any): boolean {
    return group.isDeleted === true || group.status === GroupStatus.DELETED;
  }

  static isGroupSuspended(group: any): boolean {
    return group.status === GroupStatus.SUSPENDED;
  }
}