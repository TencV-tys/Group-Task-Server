import prisma from "../prisma";
import { SocketService } from "./socket.services";
export class GroupServices {

// services/group.services.ts - UPDATED with maxMembers

static async createGroup(userId: string, groupName: string, description?: string | null) {
    
    try { 
        // Create the group with default maxMembers = 6
        const group = await prisma.group.create({
            data: {
                name: groupName,
                description: description || null,
                inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
                createdById: userId,
                currentRotationWeek: 1,
                lastRotationUpdate: new Date(),
                maxMembers: 6 // Default to 6
            }
        });

        // Create admin member with inRotation = false
        const member = await prisma.groupMember.create({
            data: {
                userId: userId,
                groupId: group.id,
                groupRole: "ADMIN",
                rotationOrder: 1,
                isActive: true,
                inRotation: false
            }
        });

        return {
            success: true,
            message: "Group Created!",
            group: {
                ...group,
                maxMembers: group.maxMembers
            },
            inviteCode: group.inviteCode,
            adminMember: {
                id: member.id,
                groupRole: member.groupRole,
                rotationOrder: member.rotationOrder,
                inRotation: member.inRotation,
                joinedAt: member.joinedAt
            }
        }

    } catch (error: any) {
        console.error("ERROR creating group:", error);
        return {
            success: false,
            message: "Error creating group",
            error: error.message
        };
    }
}

static async joinGroup(userId: string, inviteCode: string) {
  try {
    console.log(`User ${userId} trying to join with code: ${inviteCode}`);
    
    const group = await prisma.group.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() }
    });

    if (!group) { 
      return {
        success: false,
        message: "Invalid invite code"
      }
    }

    const existingMember = await prisma.groupMember.findFirst({
      where: {
        userId: userId,
        groupId: group.id
      }
    });

    if (existingMember) {
      return {
        success: false,
        message: "You are already a member of this group"
      }
    }

    // ===== CHECK MEMBER COUNT AGAINST GROUP'S MAX MEMBERS =====
    const currentMemberCount = await prisma.groupMember.count({
      where: { groupId: group.id }
    });

    if (currentMemberCount >= group.maxMembers) {
      return {
        success: false,
        message: `This group has reached its maximum capacity of ${group.maxMembers} members`
      };
    }

    // Get the next available rotation order
    const lastMember = await prisma.groupMember.findFirst({
      where: {
        groupId: group.id,
        rotationOrder: { not: null }
      },
      orderBy: { rotationOrder: 'desc' }
    });

    const nextRotationOrder = (lastMember?.rotationOrder || 0) + 1;

    // Create member with inRotation = true
    const member = await prisma.groupMember.create({
      data: {
        userId: userId,
        groupId: group.id,
        groupRole: "MEMBER",
        rotationOrder: nextRotationOrder,
        isActive: true,
        inRotation: true
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            description: true,
            currentRotationWeek: true,
            maxMembers: true
          }
        }
      }
    });

    console.log(`User ${userId} joined group ${group.id} as MEMBER with rotation order ${nextRotationOrder}`);
    
    // Get user details for the socket event
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, avatarUrl: true }
    });

    // 🔴 EMIT SOCKET EVENT FOR MEMBER JOINED
    await SocketService.emitGroupMemberJoined(
      group.id,
      userId,
      user?.fullName || 'A member',
      user?.avatarUrl || undefined
    );
    
    return {
      success: true,
      message: `Joined ${group.name} successfully`,
      group: member.group,
      membership: {
        id: member.id,
        role: member.groupRole,
        rotationOrder: member.rotationOrder,
        isActive: member.isActive,
        inRotation: member.inRotation,
        joinedAt: member.joinedAt
      },
      memberCount: currentMemberCount + 1,
      maxMembers: group.maxMembers
    }

  } catch (e: any) {
    console.error("ERROR joining group:", e);
    return {
      success: false,
      message: "Error joining group",
      error: e.message
    };
  }
}

// ===== NEW: Update group max members (admin only) =====
static async updateGroupMaxMembers(
  groupId: string,
  userId: string,
  newMaxMembers: number
) {
  try {
    // Check if user is admin
    const membership = await prisma.groupMember.findFirst({
      where: {
        userId,
        groupId,
        groupRole: "ADMIN"
      }
    });

    if (!membership) {
      return {
        success: false,
        message: "Only admins can update group settings"
      };
    }

    // Validate range (6-10)
    if (newMaxMembers < 6 || newMaxMembers > 10) {
      return {
        success: false,
        message: "Maximum members must be between 6 and 10"
      };
    }

    // Get current member count
    const currentMemberCount = await prisma.groupMember.count({
      where: { groupId }
    });

    // Can't set max lower than current members
    if (newMaxMembers < currentMemberCount) {
      return {
        success: false,
        message: `Cannot set max members to ${newMaxMembers} because the group already has ${currentMemberCount} members`
      };
    }

    // Update the group
    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: {
        maxMembers: newMaxMembers
      },
      select: {
        id: true,
        name: true,
        maxMembers: true
      }
    });

    // Create audit log
    await prisma.adminAuditLog.create({
      data: {
        adminId: userId,
        action: "GROUP_MAX_MEMBERS_UPDATED",
        details: {
          groupId,
          oldMax: await prisma.group.findUnique({ where: { id: groupId } }).then(g => g?.maxMembers),
          newMax: newMaxMembers
        }
      }
    });

    return {
      success: true,
      message: `Group capacity updated to ${newMaxMembers} members`,
      group: updatedGroup
    };

  } catch (error: any) {
    console.error("Error updating max members:", error);
    return {
      success: false,
      message: error.message || "Failed to update group capacity"
    };
  }
}

// ===== NEW: Get group with member count and max =====
static async getGroupWithLimits(groupId: string, userId: string) {
  try {
    const membership = await prisma.groupMember.findFirst({
      where: { userId, groupId }
    });

    if (!membership) {
      return {
        success: false,
        message: "You are not a member of this group"
      };
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        description: true,
        avatarUrl: true,
        inviteCode: membership.groupRole === "ADMIN",
        currentRotationWeek: true,
        maxMembers: true,
        createdAt: true,
        members: {
          select: {
            id: true,
            userId: true,
            groupRole: true,
            isActive: true,
            inRotation: true,
            joinedAt: true,
            user: {
              select: {
                fullName: true,
                email: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    if (!group) {
      return {
        success: false,
        message: "Group not found"
      };
    }

    const memberCount = group.members.length;

    return {
      success: true,
      message: "Group details retrieved",
      group: {
        ...group,
        memberCount,
        slotsAvailable: Math.max(0, group.maxMembers - memberCount),
        isFull: memberCount >= group.maxMembers,
        needsMoreMembers: memberCount < 6
      }
    };

  } catch (error: any) {
    console.error("Error getting group with limits:", error);
    return {
      success: false,
      message: error.message
    };
  }
}

  static async getUserGroups(userId: string) {
    try {
        const membership = await prisma.groupMember.findMany({
            where: { userId },
            include: {
                group: {
                    select: {
                        id: true,
                        name: true, 
                        description: true,
                        avatarUrl: true,
                        inviteCode: true,
                        createdAt: true,
                        currentRotationWeek: true,
                        lastRotationUpdate: true,
                        creator: {
                            select: {
                                id: true,
                                fullName: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                joinedAt: 'desc'
            }
        });

        const groups = membership.map(membership => ({
            ...membership.group,
            userRole: membership.groupRole,
            rotationOrder: membership.rotationOrder,
            isActive: membership.isActive,
            inRotation: membership.inRotation, // ← ADD THIS
            joinedAt: membership.joinedAt
        }));

        return {
            success: true,
            message: "Groups retrieved successfully",
            groups: groups
        }

    } catch (error: any) {
        console.error("ERROR getting user groups:", error);
        return {
            success: false,
            message: "Error retrieving groups",
            error: error.message
        };
    }
}

    // NEW: Update member rotation order
    static async updateMemberRotation(
        requesterId: string,
        groupId: string,
        memberId: string,
        rotationOrder?: number,
        isActive?: boolean
    ) {
        try {
            // Check if requester is admin
            const requesterMembership = await prisma.groupMember.findFirst({
                where: {
                    userId: requesterId,
                    groupId: groupId,
                    groupRole: "ADMIN"
                }
            });

            if (!requesterMembership) {
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
                member: updatedMember
            };

        } catch (error: any) {
            console.error("GroupServices.updateMemberRotation error:", error);
            return {
                success: false,
                message: error.message || "Error updating member rotation"
            };
        }
    }

 // NEW: Get group members with rotation info
static async getGroupMembersWithRotation(groupId: string, userId: string) {
    try {
        // Check if user is member of group
        const membership = await prisma.groupMember.findFirst({
            where: {
                userId: userId,
                groupId: groupId
            }
        });

        if (!membership) {
            return {
                success: false,
                message: "You are not a member of this group"
            };
        }

        // Get group with members
        const group = await prisma.group.findUnique({
            where: { id: groupId },
            include: {
                members: {
                    orderBy: [
                        { rotationOrder: 'asc' },
                        { joinedAt: 'asc' }
                    ],
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
                }
            }
        });

        if (!group) {
            return {
                success: false,
                message: "Group not found"
            };
        }

        // ===== UPDATED: Calculate rotation stats =====
        const membersInRotation = group.members.filter(m => m.inRotation).length;
        const admins = group.members.filter(m => m.groupRole === "ADMIN").length;

        return {
            success: true,
            message: "Group members retrieved",
            group: {
                id: group.id,
                name: group.name,
                currentRotationWeek: group.currentRotationWeek,
                lastRotationUpdate: group.lastRotationUpdate
            },
            members: group.members.map(member => ({
                id: member.id,
                userId: member.userId,
                fullName: member.user.fullName,
                email: member.user.email,
                avatarUrl: member.user.avatarUrl,
                groupRole: member.groupRole,
                rotationOrder: member.rotationOrder,
                isActive: member.isActive,
                inRotation: member.inRotation, // ← ADD THIS
                joinedAt: member.joinedAt
            })),
            stats: { // ← ADD THIS
                totalMembers: group.members.length,
                membersInRotation,
                admins,
                activeMembers: group.members.filter(m => m.isActive).length
            }
        };

    } catch (error: any) {
        console.error("GroupServices.getGroupMembersWithRotation error:", error);
        return {
            success: false,
            message: error.message || "Error retrieving group members"
        };
    }
}

    // NEW: Reorder rotation sequence
    static async reorderRotationSequence(requesterId: string, groupId: string, newOrder: Array<{ memberId: string, rotationOrder: number }>) {
        try {
            // Check if requester is admin
            const requesterMembership = await prisma.groupMember.findFirst({
                where: {
                    userId: requesterId,
                    groupId: groupId,
                    groupRole: "ADMIN"
                }
            });

            if (!requesterMembership) {
                return {
                    success: false,
                    message: "Only admins can reorder rotation sequence"
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
            console.error("GroupServices.reorderRotationSequence error:", error);
            return {
                success: false,
                message: error.message || "Error reordering rotation sequence"
            };
        }
    }

   // NEW: Get rotation schedule preview
static async getRotationSchedulePreview(groupId: string, userId: string, weeks: number = 4) {
    try {
        // Check if user is member
        const membership = await prisma.groupMember.findFirst({
            where: {
                userId: userId,
                groupId: groupId
            }
        });

        if (!membership) {
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

        // ===== UPDATED: Get active members in rotation (inRotation = true) =====
        const activeMembers = await prisma.groupMember.findMany({
            where: {
                groupId: groupId,
                isActive: true,
                inRotation: true, // ← Only members in rotation
                rotationOrder: { not: null }
            },
            orderBy: { rotationOrder: 'asc' },
            include: {
                user: {
                    select: {
                        id: true,
                        fullName: true,
                        avatarUrl: true
                    }
                }
            }
        });

        // Get recurring tasks
        const tasks = await prisma.task.findMany({
            where: {
                groupId: groupId,
                isRecurring: true
            },
            orderBy: { rotationOrder: 'asc' }
        });

        // Calculate schedule
        const schedule = [];
        for (let weekOffset = 0; weekOffset < weeks; weekOffset++) {
            const weekNumber = group.currentRotationWeek + weekOffset;
            
            const weekSchedule = {
                week: weekNumber,
                tasks: tasks.map(task => {
                    const taskIndex = (task.rotationOrder || 1) - 1;
                    const assigneeIndex = (taskIndex + weekOffset) % (activeMembers.length || 1);
                    const assignee = activeMembers[assigneeIndex];

                    return {
                        taskId: task.id,
                        taskTitle: task.title,
                        assignee: assignee ? {
                            id: assignee.userId,
                            name: assignee.user.fullName,
                            avatarUrl: assignee.user.avatarUrl
                        } : null,
                        timeOfDay: task.timeOfDay,
                        dayOfWeek: task.dayOfWeek,
                        points: task.points
                    };
                })
            };

            schedule.push(weekSchedule);
        }

        return {
            success: true,
            message: "Rotation schedule preview retrieved",
            currentWeek: group.currentRotationWeek,
            activeMembers: activeMembers.map(member => ({
                id: member.userId,
                name: member.user.fullName,
                rotationOrder: member.rotationOrder
            })),
            tasks: tasks.map(task => ({
                id: task.id,
                title: task.title,
                rotationOrder: task.rotationOrder
            })),
            schedule: schedule,
            stats: { // ← ADD THIS
                membersInRotation: activeMembers.length,
                totalTasks: tasks.length
            }
        };

    } catch (error: any) {
        console.error("GroupServices.getRotationSchedulePreview error:", error);
        return {
            success: false,
            message: error.message || "Error retrieving rotation schedule"
        };
    }
}
     
   static async getGroupInfo(groupId: string, userId: string) {
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

    // Get group info with avatar
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          where: { groupRole: "ADMIN" },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true
              }
            }
          }
        }
      }
    });

    if (!group) {
      return {
        success: false,
        message: "Group not found"
      };
    }

    // ===== UPDATED: Get member counts with rotation status =====
    const memberCount = await prisma.groupMember.count({
      where: { groupId: groupId }
    });

    const adminCount = await prisma.groupMember.count({
      where: {
        groupId: groupId,
        groupRole: "ADMIN"
      }
    });

    const membersInRotation = await prisma.groupMember.count({
      where: {
        groupId: groupId,
        inRotation: true
      }
    });

    const activeMembers = await prisma.groupMember.count({
      where: {
        groupId: groupId,
        isActive: true
      }
    });

    // Format response
    const formattedGroup = {
      id: group.id,
      name: group.name,
      description: group.description,
      avatarUrl: group.avatarUrl,
      inviteCode: group.inviteCode,
      currentRotationWeek: group.currentRotationWeek,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      memberCount: memberCount,
      adminCount: adminCount,
      membersInRotation, // ← ADD THIS
      activeMembers, // ← ADD THIS
      admins: group.members.map(member => ({
        id: member.user.id,
        fullName: member.user.fullName,
        avatarUrl: member.user.avatarUrl
      }))
    };

    return {
      success: true,
      message: "Group info retrieved successfully",
      group: formattedGroup,
      userRole: userMembership.groupRole,
      userInRotation: userMembership.inRotation // ← ADD THIS
    };

  } catch (error: any) {
    console.error("GroupServices.getGroupInfo error:", error);
    return {
      success: false,
      message: error.message || "Error retrieving group info"
    };
  }
}
// Update group info (name, description)
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
        message: "Only admins can update group info"
      };
    }

    // Validate data
    if (updateData.name && updateData.name.trim().length === 0) {
      return {
        success: false,
        message: "Group name cannot be empty"
      };
    }

    if (updateData.description && updateData.description.trim().length > 500) {
      return {
        success: false,
        message: "Description cannot exceed 500 characters"
      };
    }

    // Update group
    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: {
        name: updateData.name?.trim(),
        description: updateData.description?.trim()
      },
      select: {
        id: true,
        name: true,
        description: true,
        avatarUrl: true,
        inviteCode: true,
        currentRotationWeek: true
      }
    });

    // 🔴 EMIT SOCKET EVENT FOR GROUP UPDATED
    // Note: You may want to add a GROUP_UPDATED event to your socket service
    // For now, we'll just log it
    console.log(`Group ${groupId} updated by user ${userId}`);

    return {
      success: true,
      message: "Group updated successfully",
      group: updatedGroup
    };

  } catch (error: any) {
    console.error("GroupServices.updateGroup error:", error);
    return {
      success: false,
      message: error.message || "Error updating group"
    };
  }
}



}