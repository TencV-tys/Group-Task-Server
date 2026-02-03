// src/controllers/group.members.controller.ts
import { Request, Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { GroupMembersService } from "../services/group.members.services";
import prisma from "../prisma";
export class GroupMembersController {
  // Get all members of a group
  static async getGroupMembers(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const groupId = Array.isArray(req.params.groupId) 
        ? req.params.groupId[0] 
        : req.params.groupId;

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
        groupId: groupId
      });

    } catch (error: any) {
      console.error("GroupMembersController.getGroupMembers error:", error);
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
      const groupId = Array.isArray(req.params.groupId) 
        ? req.params.groupId[0] 
        : req.params.groupId;
      const memberId = Array.isArray(req.params.memberId) 
        ? req.params.memberId[0] 
        : req.params.memberId;

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
      const groupId = Array.isArray(req.params.groupId) 
        ? req.params.groupId[0] 
        : req.params.groupId;
      const memberId = Array.isArray(req.params.memberId) 
        ? req.params.memberId[0] 
        : req.params.memberId;
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

  // Member leaves group
  static async leaveGroup(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const groupId = Array.isArray(req.params.groupId) 
        ? req.params.groupId[0] 
        : req.params.groupId;

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

 static async getGroupInfo(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const {groupId} = req.params as {groupId:string};

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
              createdAt: true
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

      // Get member count
      const memberCount = await prisma.groupMember.count({
        where: { groupId: groupId }
      });

      // Only show invite code to admins
      const responseData: any = {
        id: membership.group.id,
        name: membership.group.name,
        description: membership.group.description,
        avatarUrl: membership.group.avatarUrl,
        createdAt: membership.group.createdAt,
        memberCount: memberCount,
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



}