// services/admin.users.service.ts - COMPLETE WORKING VERSION

import prisma from "../prisma";

export interface UserFilters {
  search?: string;
  role?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface UserStats {
  total: number;
  active: number;
  suspended: number;
  banned: number;
  groupAdmins: number;
  byRole: {
    GROUP_ADMIN: number;
    USER: number;
  };
}

export class AdminUsersService {
  
  // ========== GET USER STATISTICS ==========
  static async getUserStats(): Promise<{ success: boolean; data?: UserStats; message?: string }> {
    try {
      console.log('📊 [AdminUsersService] Fetching user stats...');
      
      const total = await prisma.user.count();
      const active = await prisma.user.count({ where: { roleStatus: 'ACTIVE' } });
      const suspended = await prisma.user.count({ where: { roleStatus: 'SUSPENDED' } });
      const disabled = await prisma.user.count({ where: { roleStatus: 'DISABLED' } });
      
      // Get users with GROUP_ADMIN role
      const roleAdmins = await prisma.user.findMany({
        where: { role: 'GROUP_ADMIN' },
        select: { id: true }
      });
      
      // Get users who are group admins via membership
      const membershipAdmins = await prisma.groupMember.findMany({
        where: { groupRole: 'ADMIN' },
        select: { userId: true },
        distinct: ['userId']
      });
      
      // Combine unique user IDs
      const adminUserIds = new Set<string>();
      roleAdmins.forEach(admin => adminUserIds.add(admin.id));
      membershipAdmins.forEach(admin => adminUserIds.add(admin.userId));
      
      const groupAdmins = adminUserIds.size;
      
      console.log('📊 [AdminUsersService] Stats calculated:', {
        total,
        active,
        suspended,
        disabled,
        groupAdmins: {
          total: groupAdmins,
          byRole: roleAdmins.length,
          byMembership: membershipAdmins.length
        }
      });
      
      const groupAdminCount = await prisma.user.count({ where: { role: 'GROUP_ADMIN' } });
      const userCount = await prisma.user.count({ where: { role: 'USER' } });
      
      return {
        success: true,
        data: {
          total,
          active,
          suspended,
          banned: disabled,
          groupAdmins,
          byRole: {
            GROUP_ADMIN: groupAdminCount,
            USER: userCount
          }
        }
      };
      
    } catch (error: any) {
      console.error("AdminUsersService.getUserStats error:", error);
      return { success: false, message: error.message || "Failed to retrieve user stats" };
    }
  }
  
  // ========== GET ALL USERS WITH FILTERS ==========
  static async getUsers(filters: UserFilters = {}) {
    try {
      const {
        search,
        role,
        status,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      const skip = (page - 1) * limit;
      const where: any = {};

      if (search) {
        where.OR = [
          { fullName: { contains: search } },
          { email: { contains: search } }
        ];
      }

      // Handle GROUP_ADMIN role filter
      let groupAdminUserIds: string[] | undefined;
      
      if (role === 'GROUP_ADMIN') {
        const roleAdmins = await prisma.user.findMany({
          where: { role: 'GROUP_ADMIN' },
          select: { id: true }
        });
        
        const membershipAdmins = await prisma.groupMember.findMany({
          where: { groupRole: 'ADMIN' },
          select: { userId: true },
          distinct: ['userId']
        });
        
        const allAdminIds = new Set<string>();
        roleAdmins.forEach(admin => allAdminIds.add(admin.id));
        membershipAdmins.forEach(admin => allAdminIds.add(admin.userId));
        
        groupAdminUserIds = Array.from(allAdminIds);
        
        console.log('📊 [AdminUsersService] GROUP_ADMIN filter:', {
          byRole: roleAdmins.length,
          byMembership: membershipAdmins.length,
          total: groupAdminUserIds.length
        });
        
        if (groupAdminUserIds.length === 0) {
          return {
            success: true,
            message: "No group admins found",
            data: {
              users: [],
              pagination: { page, limit, total: 0, pages: 0 }
            }
          };
        }
        
        where.id = { in: groupAdminUserIds };
      } else if (role) {
        where.role = role;
      }

      if (status) {
        where.roleStatus = status;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
            gender: true,
            role: true,
            roleStatus: true,
            createdAt: true,
            updatedAt: true,
            lastLoginAt: true,
            _count: {
              select: {
                groups: true,
                assignments: { where: { completed: true } }
              }
            }
          }
        }),
        prisma.user.count({ where })
      ]);

      const formattedUsers = users.map(user => {
        const isGroupAdminByRole = user.role === 'GROUP_ADMIN';
        const isGroupAdminByMembership = groupAdminUserIds ? groupAdminUserIds.includes(user.id) : false;
        
        return {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          gender: user.gender,
          role: user.role,
          roleStatus: user.roleStatus,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt,
          groupsCount: user._count.groups,
          tasksCompleted: user._count.assignments,
          isGroupAdmin: isGroupAdminByRole || isGroupAdminByMembership
        };
      });

      console.log('📊 [AdminUsersService] Returning users:', {
        total,
        returned: formattedUsers.length,
        filters: { role, status, search }
      });

      return {
        success: true,
        message: "Users retrieved successfully",
        data: {
          users: formattedUsers,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        }
      };

    } catch (error: any) {
      console.error("AdminUsersService.getUsers error:", error);
      return { success: false, message: error.message || "Failed to retrieve users" };
    }
  }

  // ========== GET SINGLE USER DETAILS ==========
  static async getUserById(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          fullName: true,
          email: true,
          avatarUrl: true,
          gender: true,
          role: true,
          roleStatus: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
          groups: {
            take: 5,
            orderBy: { joinedAt: 'desc' },
            select: {
              group: {
                select: { id: true, name: true, avatarUrl: true }
              },
              groupRole: true,
              joinedAt: true
            }
          },
          assignments: {
            where: { completed: true },
            take: 5,
            orderBy: { completedAt: 'desc' },
            select: {
              id: true,
              task: {
                select: {
                  title: true,
                  points: true,
                  group: { select: { name: true } }
                }
              },
              completedAt: true,
              points: true
            }
          }
        }
      });

      if (!user) {
        return { success: false, message: "User not found" };
      }

      const isGroupAdminByRole = user.role === 'GROUP_ADMIN';
      const isGroupAdminByMembership = await prisma.groupMember.count({
        where: { userId, groupRole: 'ADMIN' }
      }) > 0;
      
      const isGroupAdmin = isGroupAdminByRole || isGroupAdminByMembership;
      const groupsCount = await prisma.groupMember.count({ where: { userId, isActive: true } });
      const totalTasks = await prisma.assignment.count({ where: { userId } });
      const completedTasks = await prisma.assignment.count({ where: { userId, completed: true } });
      const totalPoints = await prisma.assignment.aggregate({
        where: { userId, completed: true },
        _sum: { points: true }
      });

      return {
        success: true,
        message: "User details retrieved successfully",
        data: {
          ...user,
          isGroupAdmin,
          stats: {
            groupsCount,
            totalTasks,
            completedTasks,
            pendingTasks: totalTasks - completedTasks,
            totalPoints: totalPoints._sum.points || 0
          }
        }
      };

    } catch (error: any) {
      console.error("AdminUsersService.getUserById error:", error);
      return { success: false, message: error.message || "Failed to retrieve user" };
    }
  }
}