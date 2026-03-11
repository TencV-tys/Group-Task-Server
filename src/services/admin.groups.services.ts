// services/admin.groups.services.ts
import prisma from "../prisma";

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
              take: 5, // Only get first 5 members for preview
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

      // Format response
      const formattedGroups = groups.map(group => ({
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
        // SOFT DELETE - Just archive/mark as deleted
        // Since Group model doesn't have soft delete fields, we'll rename it
        const deletedName = `[DELETED] ${group.name} ${Date.now()}`;
        
        await prisma.group.update({
          where: { id: groupId },
          data: {
            name: deletedName,
            inviteCode: `deleted_${groupId.slice(0, 8)}`,
            description: '[This group has been deleted by admin]',
            // You might want to add isDeleted field to Group model in the future
          }
        });

        // Remove all members except maybe keep for audit
        await prisma.groupMember.deleteMany({
          where: { groupId }
        });

        // Archive tasks (mark as deleted if Task has isDeleted field)
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

      // Get groups by size using Prisma instead of raw SQL
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

      // Calculate size distribution manually
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