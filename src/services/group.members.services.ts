import prisma from "../prisma";

export class GroupMembersService {
  // Get all members in a group WITH ROTATION INFO
  static async getGroupMembers(groupId: string, userId: string) {
    try {
      // Check if user is a member of the group
      const userMembership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId
        }
      });

      if (!userMembership) {
        return {
          success: false,
          message: "You are not a member of this group"
        };
      }

      // Get group info for rotation week
      const group = await prisma.group.findUnique({
        where: { id: groupId }
      });

      // Get all members with their details
      const members = await prisma.groupMember.findMany({
        where: {
          groupId: groupId
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true
            }
          }
        },
        orderBy: [
          { rotationOrder: 'asc' },
          { groupRole: 'desc' } // Admins first
        ]
      });

      // Format response with rotation info
      const formattedMembers = members.map(member => ({
        id: member.id,
        userId: member.userId,
        fullName: member.user.fullName,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl,
        role: member.groupRole,
        rotationOrder: member.rotationOrder,
        isActive: member.isActive,
        joinedAt: member.joinedAt
      }));

      return {
        success: true,
        message: "Members retrieved successfully",
        members: formattedMembers,
        userRole: userMembership.groupRole,
        currentRotationWeek: group?.currentRotationWeek || 1,
        totalMembers: members.length,
        activeMembers: members.filter(m => m.isActive).length
      };

    } catch (error: any) {
      console.error("GroupMembersService.getGroupMembers error:", error);
      return {
        success: false,
        message: error.message || "Error retrieving members"
      };
    }
  }

  // Get group members with detailed rotation info
  static async getGroupMembersWithRotation(groupId: string, userId: string) {
    try {
      // Check if user is a member of the group
      const userMembership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId
        }
      });

      if (!userMembership) {
        return {
          success: false,
          message: "You are not a member of this group"
        };
      }

      // Get group info
      const group = await prisma.group.findUnique({
        where: { id: groupId }
      });

      if (!group) {
        return {
          success: false,
          message: "Group not found"
        };
      }

      // Get all members with rotation details
      const members = await prisma.groupMember.findMany({
        where: {
          groupId: groupId
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true
            }
          }
        },
        orderBy: [
          { rotationOrder: 'asc' },
          { joinedAt: 'asc' }
        ]
      });

      // Get assignments for current week for each member
      const currentWeekAssignments = await prisma.assignment.findMany({
        where: {
          task: {
            groupId: groupId
          },
          rotationWeek: group.currentRotationWeek
        },
        include: {
          task: {
            select: {
              id: true,
              title: true,
              points: true
            }
          },
          user: {
            select: {
              id: true,
              fullName: true
            }
          }
        }
      });

      // Get all recurring tasks to calculate rotation
      const recurringTasks = await prisma.task.findMany({
        where: {
          groupId: groupId,
          isRecurring: true
        },
        orderBy: { rotationOrder: 'asc' }
      });

      // Format response with rotation calculations
      const formattedMembers = members.map(member => {
        // Get current week assignments for this member
        const memberCurrentAssignments = currentWeekAssignments
          .filter(assignment => assignment.userId === member.userId)
          .map(assignment => ({
            id: assignment.id,
            taskId: assignment.taskId,
            taskTitle: assignment.task.title,
            points: assignment.task.points,
            completed: assignment.completed
          }));

        // Calculate which tasks this member would get in upcoming weeks
        const upcomingTasks = [];
        for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
          const tasksThisWeek = recurringTasks.filter(task => {
            const taskIndex = (task.rotationOrder || 1) - 1;
            const memberIndex = members.findIndex(m => m.userId === member.userId);
            const assigneeIndex = (taskIndex + weekOffset) % members.length;
            return assigneeIndex === memberIndex;
          });

          upcomingTasks.push({
            week: group.currentRotationWeek + weekOffset,
            tasks: tasksThisWeek.map(task => ({
              id: task.id,
              title: task.title,
              points: task.points
            }))
          });
        }

        return {
          id: member.id,
          userId: member.userId,
          fullName: member.user.fullName,
          email: member.user.email,
          avatarUrl: member.user.avatarUrl,
          role: member.groupRole,
          rotationOrder: member.rotationOrder,
          isActive: member.isActive,
          joinedAt: member.joinedAt,
          currentTasks: memberCurrentAssignments,
          upcomingTasks: upcomingTasks
        };
      });

      return {
        success: true,
        message: "Members with rotation details retrieved",
        members: formattedMembers,
        userRole: userMembership.groupRole,
        group: {
          id: group.id,
          name: group.name,
          currentRotationWeek: group.currentRotationWeek,
          lastRotationUpdate: group.lastRotationUpdate
        },
        rotationStats: {
          totalMembers: members.length,
          activeMembers: members.filter(m => m.isActive).length,
          recurringTasks: recurringTasks.length
        }
      };

    } catch (error: any) {
      console.error("GroupMembersService.getGroupMembersWithRotation error:", error);
      return {
        success: false,
        message: error.message || "Error retrieving members with rotation details"
      };
    }
  }

  // Remove a member from group (admin only) - UPDATED FOR ROTATION
  static async removeMember(groupId: string, memberId: string, adminId: string) {
    try {
      // Check if admin is actually admin
      const adminMembership = await prisma.groupMember.findFirst({
        where: {
          userId: adminId,
          groupId: groupId,
          groupRole: "ADMIN"
        }
      });

      if (!adminMembership) {
        return {
          success: false,
          message: "Only admins can remove members"
        };
      }

      // Don't allow removing yourself if you're the only admin
      const allAdmins = await prisma.groupMember.count({
        where: {
          groupId: groupId,
          groupRole: "ADMIN"
        }
      });

      const targetMember = await prisma.groupMember.findFirst({
        where: {
          id: memberId,
          groupId: groupId
        }
      });

      if (!targetMember) {
        return {
          success: false,
          message: "Member not found"
        };
      }

      // Check if trying to remove the only admin
      if (targetMember.groupRole === "ADMIN" && allAdmins <= 1) {
        return {
          success: false,
          message: "Cannot remove the only admin. Promote another member to admin first."
        };
      }

      // Before deleting, check if this affects rotation
      const activeMembers = await prisma.groupMember.findMany({
        where: {
          groupId: groupId,
          isActive: true,
          rotationOrder: { not: null }
        },
        orderBy: { rotationOrder: 'asc' }
      });

      // Delete the member
      await prisma.groupMember.delete({
        where: { id: memberId }
      });

      // If removed member was in rotation, we may need to adjust tasks
      if (targetMember.isActive && targetMember.rotationOrder !== null) {
        // Get tasks assigned to this member for current and future weeks
        const currentAssignments = await prisma.assignment.findMany({
          where: {
            userId: targetMember.userId,
            task: {
              groupId: groupId
            },
            rotationWeek: { gte: (await prisma.group.findUnique({ where: { id: groupId } }))?.currentRotationWeek || 1 }
          }
        });

        // For now, just log this - in a full implementation, you'd reassign these tasks
        console.log(`Removed member ${targetMember.userId} had ${currentAssignments.length} future assignments`);
      }

      return {
        success: true,
        message: "Member removed successfully"
      };

    } catch (error: any) {
      console.error("GroupMembersService.removeMember error:", error);
      return {
        success: false,
        message: error.message || "Error removing member"
      };
    }
  }

  // Promote/demote member (admin only)
  static async updateMemberRole(groupId: string, memberId: string, newRole: string, adminId: string) {
    try {
      // Check if admin is actually admin
      const adminMembership = await prisma.groupMember.findFirst({
        where: {
          userId: adminId,
          groupId: groupId,
          groupRole: "ADMIN"
        }
      });

      if (!adminMembership) {
        return {
          success: false,
          message: "Only admins can update member roles"
        };
      }

      // Don't allow demoting the only admin
      if (newRole === "MEMBER") {
        const allAdmins = await prisma.groupMember.count({
          where: {
            groupId: groupId,
            groupRole: "ADMIN"
          }
        });

        const targetMember = await prisma.groupMember.findFirst({
          where: {
            id: memberId,
            groupId: groupId
          }
        });

        if (targetMember?.groupRole === "ADMIN" && allAdmins <= 1) {
          return {
            success: false,
            message: "Cannot demote the only admin. Promote another member to admin first."
          };
        }
      }

      // Update the role
      await prisma.groupMember.update({
        where: { id: memberId },
        data: { groupRole: newRole as any }
      });

      return {
        success: true,
        message: "Member role updated successfully"
      };

    } catch (error: any) {
      console.error("GroupMembersService.updateMemberRole error:", error);
      return {
        success: false,
        message: error.message || "Error updating member role"
      };
    }
  }

  // Update member rotation settings
  static async updateMemberRotation(
    groupId: string,
    memberId: string,
    adminId: string,
    rotationOrder?: number,
    isActive?: boolean
  ) {
    try {
      // Check if admin is actually admin
      const adminMembership = await prisma.groupMember.findFirst({
        where: {
          userId: adminId,
          groupId: groupId,
          groupRole: "ADMIN"
        }
      });

      if (!adminMembership) {
        return {
          success: false,
          message: "Only admins can update rotation settings"
        };
      }

      // Check if member exists in group
      const member = await prisma.groupMember.findFirst({
        where: {
          id: memberId,
          groupId: groupId
        }
      });

      if (!member) {
        return {
          success: false,
          message: "Member not found in this group"
        };
      }

      // Prepare update data
      const updateData: any = {};
      if (rotationOrder !== undefined) updateData.rotationOrder = rotationOrder;
      if (isActive !== undefined) updateData.isActive = isActive;

      // If setting to inactive, check if member has current assignments
      if (isActive === false && member.isActive === true) {
        const currentWeek = (await prisma.group.findUnique({ where: { id: groupId } }))?.currentRotationWeek || 1;
        const currentAssignments = await prisma.assignment.findMany({
          where: {
            userId: member.userId,
            task: {
              groupId: groupId
            },
            rotationWeek: currentWeek,
            completed: false
          }
        });

        if (currentAssignments.length > 0) {
          return {
            success: false,
            message: `Cannot deactivate member with ${currentAssignments.length} uncompleted tasks for this week`
          };
        }
      }

      // Update member
      const updatedMember = await prisma.groupMember.update({
        where: { id: memberId },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              avatarUrl: true
            }
          }
        }
      });

      return {
        success: true,
        message: "Member rotation settings updated",
        member: {
          id: updatedMember.id,
          userId: updatedMember.userId,
          fullName: updatedMember.user.fullName,
          email: updatedMember.user.email,
          avatarUrl: updatedMember.user.avatarUrl,
          role: updatedMember.groupRole,
          rotationOrder: updatedMember.rotationOrder,
          isActive: updatedMember.isActive,
          joinedAt: updatedMember.joinedAt
        }
      };

    } catch (error: any) {
      console.error("GroupMembersService.updateMemberRotation error:", error);
      return {
        success: false,
        message: error.message || "Error updating member rotation"
      };
    }
  }

  // Reorder rotation sequence
  static async reorderRotationSequence(groupId: string, adminId: string, newOrder: Array<{ memberId: string, rotationOrder: number }>) {
    try {
      // Check if admin is actually admin
      const adminMembership = await prisma.groupMember.findFirst({
        where: {
          userId: adminId,
          groupId: groupId,
          groupRole: "ADMIN"
        }
      });

      if (!adminMembership) {
        return {
          success: false,
          message: "Only admins can reorder rotation sequence"
        };
      }

      // Validate new order
      const uniqueOrders = new Set(newOrder.map(item => item.rotationOrder));
      if (uniqueOrders.size !== newOrder.length) {
        return {
          success: false,
          message: "Duplicate rotation orders found"
        };
      }

      // Update all members in transaction
      const updates = newOrder.map(({ memberId, rotationOrder }) =>
        prisma.groupMember.update({
          where: { id: memberId },
          data: { rotationOrder: rotationOrder }
        })
      );

      await prisma.$transaction(updates);

      return {
        success: true,
        message: "Rotation sequence updated successfully"
      };

    } catch (error: any) {
      console.error("GroupMembersService.reorderRotationSequence error:", error);
      return {
        success: false,
        message: error.message || "Error reordering rotation sequence"
      };
    }
  }

  // ✅ NEW: Update group information (name, description) - admin only
  static async updateGroup(groupId: string, userId: string, updateData: { name?: string, description?: string }) {
    try {
      // Check if user is admin
      const userMembership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId,
          groupRole: "ADMIN"
        }
      });

      if (!userMembership) {
        return {
          success: false,
          message: "Only admins can update group information"
        };
      }

      // Validate data
      if (updateData.name !== undefined && updateData.name.trim().length === 0) {
        return {
          success: false,
          message: "Group name cannot be empty"
        };
      }

      if (updateData.description !== undefined && updateData.description.length > 500) {
        return {
          success: false,
          message: "Description cannot exceed 500 characters"
        };
      }

      // Prepare update data
      const data: any = {};
      if (updateData.name !== undefined) {
        data.name = updateData.name.trim();
      }
      if (updateData.description !== undefined) {
        data.description = updateData.description.trim() || null;
      }

      if (Object.keys(data).length === 0) {
        return {
          success: false,
          message: "No data provided to update"
        };
      }

      // Update group
      const updatedGroup = await prisma.group.update({
        where: { id: groupId },
        data: data,
        select: {
          id: true,
          name: true,
          description: true,
          avatarUrl: true,
          inviteCode: true,
          currentRotationWeek: true,
          createdAt: true
        }
      });

      return {
        success: true,
        message: "Group updated successfully",
        group: updatedGroup
      };

    } catch (error: any) {
      console.error("GroupMembersService.updateGroup error:", error);
      
      if (error.code === 'P2025') {
        return {
          success: false,
          message: "Group not found"
        };
      }

      return {
        success: false,
        message: error.message || "Error updating group"
      };
    }
  }

  // ✅ NEW: Delete group avatar
  static async deleteGroupAvatar(groupId: string, userId: string) {
    try {
      // Check if user is admin
      const userMembership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId,
          groupRole: "ADMIN"
        }
      });

      if (!userMembership) {
        return {
          success: false,
          message: "Only admins can delete group avatar"
        };
      }

      // Update group to remove avatar
      const updatedGroup = await prisma.group.update({
        where: { id: groupId },
        data: { avatarUrl: null },
        select: {
          id: true,
          name: true,
          avatarUrl: true
        }
      });

      return {
        success: true,
        message: "Group avatar deleted successfully",
        group: updatedGroup
      };

    } catch (error: any) {
      console.error("GroupMembersService.deleteGroupAvatar error:", error);
      return {
        success: false,
        message: error.message || "Error deleting group avatar"
      };
    }
  }

  // ✅ NEW: Get group settings (full details for admin)
  static async getGroupSettings(groupId: string, userId: string) {
    try {
      // Check if user is a member
      const userMembership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId
        }
      });

      if (!userMembership) {
        return {
          success: false,
          message: "You are not a member of this group"
        };
      }

      // Get group with all details
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                  avatarUrl: true
                }
              }
            },
            orderBy: [
              { rotationOrder: 'asc' },
              { joinedAt: 'asc' }
            ]
          }
        }
      });

      if (!group) {
        return {
          success: false,
          message: "Group not found"
        };
      }

      // Get task counts
      const taskCount = await prisma.task.count({
        where: { groupId: groupId }
      });

      const recurringTaskCount = await prisma.task.count({
        where: { 
          groupId: groupId,
          isRecurring: true 
        }
      });

      // Format response
      const formattedGroup = {
        id: group.id,
        name: group.name,
        description: group.description,
        avatarUrl: group.avatarUrl,
        inviteCode: userMembership.groupRole === "ADMIN" ? group.inviteCode : undefined, // Only admins see invite code
        currentRotationWeek: group.currentRotationWeek,
        lastRotationUpdate: group.lastRotationUpdate,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        stats: {
          totalMembers: group.members.length,
          activeMembers: group.members.filter(m => m.isActive).length,
          admins: group.members.filter(m => m.groupRole === "ADMIN").length,
          totalTasks: taskCount,
          recurringTasks: recurringTaskCount
        },
        members: group.members.map(m => ({
          id: m.id,
          userId: m.userId,
          fullName: m.user.fullName,
          email: m.user.email,
          avatarUrl: m.user.avatarUrl,
          role: m.groupRole,
          rotationOrder: m.rotationOrder,
          isActive: m.isActive,
          joinedAt: m.joinedAt
        })),
        userRole: userMembership.groupRole
      };

      return {
        success: true,
        message: "Group settings retrieved successfully",
        group: formattedGroup
      };

    } catch (error: any) {
      console.error("GroupMembersService.getGroupSettings error:", error);
      return {
        success: false,
        message: error.message || "Error retrieving group settings"
      };
    }
  }

  // ✅ NEW: Transfer ownership
  static async transferOwnership(groupId: string, currentAdminId: string, newAdminId: string) {
    try {
      // Check if current user is admin
      const currentAdmin = await prisma.groupMember.findFirst({
        where: {
          userId: currentAdminId,
          groupId: groupId,
          groupRole: "ADMIN"
        }
      });

      if (!currentAdmin) {
        return {
          success: false,
          message: "Only admins can transfer ownership"
        };
      }

      // Check if new admin is a member
      const newAdmin = await prisma.groupMember.findFirst({
        where: {
          userId: newAdminId,
          groupId: groupId
        }
      });

      if (!newAdmin) {
        return {
          success: false,
          message: "New admin is not a member of this group"
        };
      }

      // Transaction to swap roles
      await prisma.$transaction([
        // Demote current admin to MEMBER
        prisma.groupMember.update({
          where: { id: currentAdmin.id },
          data: { groupRole: "MEMBER" }
        }),
        // Promote new admin to ADMIN
        prisma.groupMember.update({
          where: { id: newAdmin.id },
          data: { groupRole: "ADMIN" }
        })
      ]);

      return {
        success: true,
        message: "Ownership transferred successfully"
      };

    } catch (error: any) {
      console.error("GroupMembersService.transferOwnership error:", error);
      return {
        success: false,
        message: error.message || "Error transferring ownership"
      };
    }
  }

  // ✅ NEW: Regenerate invite code
  static async regenerateInviteCode(groupId: string, userId: string) {
    try {
      // Check if user is admin
      const userMembership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId,
          groupRole: "ADMIN"
        }
      });

      if (!userMembership) {
        return {
          success: false,
          message: "Only admins can regenerate invite code"
        };
      }

      // Generate new invite code
      const newInviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      // Update group
      const updatedGroup = await prisma.group.update({
        where: { id: groupId },
        data: { inviteCode: newInviteCode },
        select: { inviteCode: true }
      });

      return {
        success: true,
        message: "Invite code regenerated successfully",
        inviteCode: updatedGroup.inviteCode
      };

    } catch (error: any) {
      console.error("GroupMembersService.regenerateInviteCode error:", error);
      return {
        success: false,
        message: error.message || "Error regenerating invite code"
      };
    }
  }

  // ✅ NEW: Delete group (admin only)
  static async deleteGroup(groupId: string, userId: string) {
    try {
      // Check if user is admin
      const userMembership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId,
          groupRole: "ADMIN"
        }
      });

      if (!userMembership) {
        return {
          success: false,
          message: "Only admins can delete the group"
        };
      }

      // Delete the group (cascades to members, tasks, assignments)
      await prisma.group.delete({
        where: { id: groupId }
      });

      return {
        success: true,
        message: "Group deleted successfully"
      };

    } catch (error: any) {
      console.error("GroupMembersService.deleteGroup error:", error);
      
      if (error.code === 'P2025') {
        return {
          success: false,
          message: "Group not found"
        };
      }

      return {
        success: false,
        message: error.message || "Error deleting group"
      };
    }
  }
}