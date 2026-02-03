// src/services/group.members.service.ts
import prisma from "../prisma";

export class GroupMembersService {
  // Get all members in a group
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
        orderBy: {
          groupRole: 'desc' // Admins first
        }
      });

      // Format response
      const formattedMembers = members.map(member => ({
        id: member.id,
        userId: member.userId,
        fullName: member.user.fullName,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl,
        role: member.groupRole,
        joinedAt: member.joinedAt
      }));

      return {
        success: true,
        message: "Members retrieved successfully",
        members: formattedMembers,
        userRole: userMembership.groupRole
      };

    } catch (error: any) {
      console.error("GroupMembersService.getGroupMembers error:", error);
      return {
        success: false,
        message: error.message || "Error retrieving members"
      };
    }
  }

  // Remove a member from group (admin only)
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

      // Delete the member
      await prisma.groupMember.delete({
        where: { id: memberId }
      });

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
}