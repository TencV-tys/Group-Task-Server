import { Request, Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { GroupMembersService } from "../services/group.members.services";
import prisma from "../prisma";

export class GroupMembersController {
  // Get all members of a group
  static async getGroupMembers(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await GroupMembersService.getGroupMembers(groupId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        members: result.members,
        userRole: result.userRole,
        currentRotationWeek: result.currentRotationWeek,
        groupId: groupId,
        stats: {
          totalMembers: result.totalMembers,
          activeMembers: result.activeMembers
        }
      });

    } catch (error: any) {
      console.error("GroupMembersController.getGroupMembers error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get group members with rotation details
  static async getGroupMembersWithRotation(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await GroupMembersService.getGroupMembersWithRotation(groupId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        }); 
      }

      return res.json({
        success: true,
        message: result.message,
        group: result.group,
        members: result.members,
        userRole: result.userRole,
        rotationStats: result.rotationStats
      });

    } catch (error: any) {
      console.error("GroupMembersController.getGroupMembersWithRotation error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Remove a member from group (admin only)
  static async removeMember(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId, memberId } = req.params as { groupId: string, memberId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId || !memberId) {
        return res.status(400).json({
          success: false,
          message: "Group ID and Member ID are required"
        });
      }

      const result = await GroupMembersService.removeMember(groupId, memberId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message
      });

    } catch (error: any) {
      console.error("GroupMembersController.removeMember error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Update member role (admin only)
  static async updateMemberRole(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId, memberId } = req.params as { groupId: string, memberId: string };
      const { newRole } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId || !memberId || !newRole) {
        return res.status(400).json({
          success: false,
          message: "Group ID, Member ID, and new role are required"
        });
      }

      if (!['ADMIN', 'MEMBER'].includes(newRole)) {
        return res.status(400).json({
          success: false,
          message: "Invalid role. Must be ADMIN or MEMBER"
        });
      }

      const result = await GroupMembersService.updateMemberRole(groupId, memberId, newRole, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message
      });

    } catch (error: any) {
      console.error("GroupMembersController.updateMemberRole error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Update member rotation settings
  static async updateMemberRotation(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId, memberId } = req.params as { groupId: string, memberId: string };
      const { rotationOrder, isActive } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId || !memberId) {
        return res.status(400).json({
          success: false,
          message: "Group ID and Member ID are required"
        });
      }

      const result = await GroupMembersService.updateMemberRotation(
        groupId,
        memberId,
        userId,
        rotationOrder,
        isActive
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        member: result.member
      });

    } catch (error: any) {
      console.error("GroupMembersController.updateMemberRotation error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Reorder rotation sequence
  static async reorderRotationSequence(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { newOrder } = req.body; // Array of { memberId, rotationOrder }

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId || !newOrder || !Array.isArray(newOrder)) {
        return res.status(400).json({
          success: false,
          message: "Group ID and new order array are required"
        });
      }

      const result = await GroupMembersService.reorderRotationSequence(groupId, userId, newOrder);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message
      });

    } catch (error: any) {
      console.error("GroupMembersController.reorderRotationSequence error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Member leaves group
  static async leaveGroup(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      // Find user's membership
      const userMembership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId
        }
      });

      if (!userMembership) {
        return res.status(400).json({
          success: false,
          message: "You are not a member of this group"
        });
      }

      // Check if user is the only admin
      if (userMembership.groupRole === "ADMIN") {
        const adminCount = await prisma.groupMember.count({
          where: {
            groupId: groupId,
            groupRole: "ADMIN"
          }
        });

        if (adminCount <= 1) {
          return res.status(400).json({
            success: false,
            message: "Cannot leave as the only admin. Promote another member to admin first."
          });
        }
      }

      // If member is active in rotation, check for current tasks
      if (userMembership.isActive) {
        const group = await prisma.group.findUnique({
          where: { id: groupId }
        });

        if (group) {
          const currentAssignments = await prisma.assignment.findMany({
            where: {
              userId: userId,
              task: {
                groupId: groupId
              },
              rotationWeek: group.currentRotationWeek,
              completed: false
            }
          });

          if (currentAssignments.length > 0) {
            return res.status(400).json({
              success: false,
              message: `You have ${currentAssignments.length} uncompleted tasks for this week. Complete them or request a swap before leaving.`
            });
          }
        }
      }

      // Delete the membership
      await prisma.groupMember.delete({
        where: { id: userMembership.id }
      });

      return res.json({
        success: true,
        message: "You have left the group"
      });

    } catch (error: any) {
      console.error("GroupMembersController.leaveGroup error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // Get group info
  static async getGroupInfo(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      // Check if user is a member of the group
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: groupId
        },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              inviteCode: true,
              avatarUrl: true,
              createdAt: true,
              currentRotationWeek: true,
              lastRotationUpdate: true
            }
          }
        }
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: "You are not a member of this group"
        });
      }

      // Get member count and rotation stats
      const memberCount = await prisma.groupMember.count({
        where: { groupId: groupId }
      });

      const activeMemberCount = await prisma.groupMember.count({
        where: { 
          groupId: groupId,
          isActive: true 
        }
      });

      const recurringTaskCount = await prisma.task.count({
        where: { 
          groupId: groupId,
          isRecurring: true 
        }
      });

      // Only show invite code to admins
      const responseData: any = {
        id: membership.group.id,
        name: membership.group.name,
        description: membership.group.description,
        avatarUrl: membership.group.avatarUrl,
        createdAt: membership.group.createdAt,
        currentRotationWeek: membership.group.currentRotationWeek,
        lastRotationUpdate: membership.group.lastRotationUpdate,
        memberCount: memberCount,
        activeMemberCount: activeMemberCount,
        recurringTaskCount: recurringTaskCount,
        userRole: membership.groupRole
      };

      // Only include invite code if user is admin
      if (membership.groupRole === "ADMIN") {
        responseData.inviteCode = membership.group.inviteCode;
      }

      return res.json({
        success: true,
        message: "Group info retrieved",
        group: responseData
      });

    } catch (error: any) {
      console.error("GroupMembersController.getGroupInfo error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ✅ NEW: Update group (name, description) - admin only
  static async updateGroup(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { name, description } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await GroupMembersService.updateGroup(groupId, userId, {
        name,
        description
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        group: result.group
      });

    } catch (error: any) {
      console.error("GroupMembersController.updateGroup error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ✅ NEW: Delete group avatar
  static async deleteGroupAvatar(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await GroupMembersService.deleteGroupAvatar(groupId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        group: result.group
      });

    } catch (error: any) {
      console.error("GroupMembersController.deleteGroupAvatar error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ✅ NEW: Get group settings
  static async getGroupSettings(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await GroupMembersService.getGroupSettings(groupId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        group: result.group
      });

    } catch (error: any) {
      console.error("GroupMembersController.getGroupSettings error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ✅ NEW: Transfer ownership
  static async transferOwnership(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { newAdminId } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      if (!newAdminId) {
        return res.status(400).json({
          success: false,
          message: "New admin ID is required"
        });
      }

      const result = await GroupMembersService.transferOwnership(groupId, userId, newAdminId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message
      });

    } catch (error: any) {
      console.error("GroupMembersController.transferOwnership error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ✅ NEW: Regenerate invite code
  static async regenerateInviteCode(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await GroupMembersService.regenerateInviteCode(groupId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message,
        inviteCode: result.inviteCode
      });

    } catch (error: any) {
      console.error("GroupMembersController.regenerateInviteCode error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ✅ NEW: Delete group (admin only)
  static async deleteGroup(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      const result = await GroupMembersService.deleteGroup(groupId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      return res.json({
        success: true,
        message: result.message
      });

    } catch (error: any) {
      console.error("GroupMembersController.deleteGroup error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}