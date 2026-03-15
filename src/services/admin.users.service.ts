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

export class AdminUsersService {
  
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

      // Build where clause
      const where: any = {};

      if (search) {
        where.OR = [
          { fullName: { contains: search } },
          { email: { contains: search } }
        ];
      }

      // ===== FIXED: Handle GROUP_ADMIN role filter =====
      let groupAdminUserIds: string[] | undefined;
      
      if (role === 'GROUP_ADMIN') {
        // Get all users who are admins of any group
        const groupAdmins = await prisma.groupMember.findMany({
          where: { groupRole: 'ADMIN' },
          select: { userId: true },
          distinct: ['userId']
        });
        groupAdminUserIds = groupAdmins.map(ga => ga.userId);
        
        // If no group admins, return empty result
        if (groupAdminUserIds.length === 0) {
          return {
            success: true,
            message: "No group admins found",
            data: {
              users: [],
              pagination: {
                page,
                limit,
                total: 0,
                pages: 0
              }
            }
          };
        }
        
        where.id = { in: groupAdminUserIds };
      } else if (role) {
        // Regular role filter
        where.role = role;
      }

      if (status) {
        where.roleStatus = status;
      }

      // Get users with basic info only (no edit/delete yet)
      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            [sortBy]: sortOrder
          },
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
            // Include counts for display
            _count: {
              select: {
                groups: true,
                assignments: {
                  where: { completed: true }
                }
              }
            }
          }
        }),
        prisma.user.count({ where })
      ]);

      // Format response - add isGroupAdmin flag for UI
      const formattedUsers = users.map(user => ({
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
        // Add flag to indicate if user is a group admin (useful for UI)
        isGroupAdmin: groupAdminUserIds ? groupAdminUserIds.includes(user.id) : false
      }));

      return {
        success: true,
        message: "Users retrieved successfully",
        data: {
          users: formattedUsers,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      };

    } catch (error: any) {
      console.error("AdminUsersService.getUsers error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve users"
      };
    }
  }

  // ========== GET SINGLE USER DETAILS FOR MODAL ==========
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
          // Get groups they belong to
          groups: {
            take: 5,
            orderBy: { joinedAt: 'desc' },
            select: {
              group: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true
                }
              },
              groupRole: true,
              joinedAt: true
            }
          },
          // Get recent completed tasks
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
                  group: {
                    select: { name: true }
                  }
                }
              },
              completedAt: true,
              points: true
            }
          }
        }
      });

      if (!user) {
        return {
          success: false,
          message: "User not found"
        };
      }

      // Check if user is a group admin
      const isGroupAdmin = await prisma.groupMember.count({
        where: { 
          userId, 
          groupRole: 'ADMIN' 
        }
      }) > 0;

      // Get counts
      const groupsCount = await prisma.groupMember.count({
        where: { userId, isActive: true }
      });

      const totalTasks = await prisma.assignment.count({
        where: { userId }
      });

      const completedTasks = await prisma.assignment.count({
        where: { userId, completed: true }
      });

      const totalPoints = await prisma.assignment.aggregate({
        where: { userId, completed: true },
        _sum: { points: true }
      });

      return {
        success: true,
        message: "User details retrieved successfully",
        data: {
          ...user,
          isGroupAdmin, // Add this flag
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
      return {
        success: false,
        message: error.message || "Failed to retrieve user"
      };
    }
  }
}