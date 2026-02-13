import prisma from "../prisma";
import { Prisma } from '@prisma/client';

export class SwapRequestService {
  
  // CREATE: Create a new swap request
  static async createSwapRequest(
    userId: string,
    assignmentId: string,
    data: {
      reason?: string;
      targetUserId?: string;
      expiresAt?: Date;
    }
  ) {
    try {
      // Check if assignment exists and belongs to user
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          task: {
            include: {
              group: true,
              timeSlots: true
            }
          },
          user: true,
          timeSlot: true
        }
      });

      if (!assignment) {
        return { success: false, message: "Assignment not found" };
      }

      if (assignment.userId !== userId) {
        return { success: false, message: "You can only request swap for your own assignments" };
      }

      if (assignment.completed) {
        return { success: false, message: "Cannot swap completed assignments" };
      }

      // Check if user is still a member of the group
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId: assignment.task.groupId,
          isActive: true
        }
      });

      if (!membership) {
        return { success: false, message: "You are not an active member of this group" };
      }

      // Check if target user is specified and valid
      if (data.targetUserId) {
        const targetMembership = await prisma.groupMember.findFirst({
          where: {
            userId: data.targetUserId,
            groupId: assignment.task.groupId,
            isActive: true
          }
        });

        if (!targetMembership) {
          return { success: false, message: "Target user is not an active member of this group" };
        }

        if (data.targetUserId === userId) {
          return { success: false, message: "Cannot swap assignment with yourself" };
        }
      }

      // Check if there's already a pending swap request for this assignment
      const existingRequest = await prisma.swapRequest.findFirst({
        where: {
          assignmentId,
          status: "PENDING"
        }
      });

      if (existingRequest) {
        return { 
          success: false, 
          message: "A pending swap request already exists for this assignment" 
        };
      }

      // Check 24 hour rule
      const now = new Date();
      const dueDate = new Date(assignment.dueDate);
      const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursUntilDue < 24) {
        return { 
          success: false, 
          message: "Cannot swap assignments less than 24 hours before due date" 
        };
      }

      // Set default expiry if not provided (48 hours from now)
      let expiresAt = data.expiresAt;
      if (!expiresAt) {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);
      }

      // Create swap request - only using fields that exist in schema
      const swapRequest = await prisma.swapRequest.create({
        data: {
          assignmentId,
          reason: data.reason,
          status: "PENDING",
          requestedBy: userId,
          targetUserId: data.targetUserId,
          expiresAt
        }
      });

      // Fetch the created request with additional data for response
      const swapRequestWithDetails = await prisma.swapRequest.findUnique({
        where: { id: swapRequest.id },
        include: {
          assignment: {
            include: {
              task: {
                select: {
                  id: true,
                  title: true,
                  executionFrequency: true,
                  points: true
                }
              },
              timeSlot: true,
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

      // Get requester info separately
      const requester = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          fullName: true,
          avatarUrl: true
        }
      });

      // Create notification for target user if specified
      if (data.targetUserId) {
        await prisma.userNotification.create({
          data: {
            userId: data.targetUserId,
            type: "SWAP_REQUEST",
            title: "Swap Request",
            message: `${assignment.user.fullName || "A user"} wants to swap "${assignment.task.title}" with you`,
            data: {
              swapRequestId: swapRequest.id,
              assignmentId,
              taskId: assignment.taskId,
              groupId: assignment.task.groupId,
              requesterId: userId,
              requesterName: assignment.user.fullName,
              dueDate: assignment.dueDate
            }
          }
        });
      } else {
        // Notify all active members if request is open to anyone
        const activeMembers = await prisma.groupMember.findMany({
          where: {
            groupId: assignment.task.groupId,
            isActive: true,
            userId: { not: userId } // Exclude requester
          },
          select: { userId: true }
        });

        for (const member of activeMembers) {
          await prisma.userNotification.create({
            data: {
              userId: member.userId,
              type: "SWAP_REQUEST",
              title: "Swap Request Available",
              message: `${assignment.user.fullName || "A user"} is looking to swap "${assignment.task.title}"`,
              data: {
                swapRequestId: swapRequest.id,
                assignmentId,
                taskId: assignment.taskId,
                groupId: assignment.task.groupId,
                requesterId: userId,
                requesterName: assignment.user.fullName,
                dueDate: assignment.dueDate
              }
            }
          });
        }
      }

      return {
        success: true,
        message: "Swap request created successfully",
        swapRequest: {
          ...swapRequestWithDetails,
          requester // Add requester info manually
        }
      };

    } catch (error: any) {
      console.error("SwapRequestService.createSwapRequest error:", error);
      return { success: false, message: error.message || "Error creating swap request" };
    }
  }

  // GET: Get swap requests created by a user
  static async getUserSwapRequests(
    userId: string,
    filters: {
      status?: string;
      groupId?: string;
      limit: number;
      offset: number;
    }
  ) {
    try {
      const where: any = {
        requestedBy: userId
      };

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.groupId) {
        where.assignment = {
          task: {
            groupId: filters.groupId
          }
        };
      }

      const [requests, total] = await Promise.all([
        prisma.swapRequest.findMany({
          where,
          include: {
            assignment: {
              include: {
                task: {
                  select: {
                    id: true,
                    title: true,
                    points: true,
                    executionFrequency: true,
                    group: {
                      select: {
                        id: true,
                        name: true
                      }
                    }
                  }
                },
                timeSlot: true,
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    avatarUrl: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: filters.limit,
          skip: filters.offset
        }),
        prisma.swapRequest.count({ where })
      ]);

      // Get requester info for each request
      const requestsWithDetails = await Promise.all(
        requests.map(async (request) => {
          const requester = await prisma.user.findUnique({
            where: { id: request.requestedBy },
            select: {
              id: true,
              fullName: true,
              avatarUrl: true
            }
          });

          let targetUser = null;
          if (request.targetUserId) {
            targetUser = await prisma.user.findUnique({
              where: { id: request.targetUserId },
              select: {
                id: true,
                fullName: true,
                avatarUrl: true
              }
            });
          }

          return {
            ...request,
            requester,
            targetUser
          };
        })
      );

      return {
        success: true,
        message: "Swap requests retrieved successfully",
        requests: requestsWithDetails,
        total
      };

    } catch (error: any) {
      console.error("SwapRequestService.getUserSwapRequests error:", error);
      return { success: false, message: error.message || "Error retrieving swap requests" };
    }
  }

  // GET: Get pending swap requests for a user (to accept/reject)
  static async getPendingSwapRequestsForUser(
    userId: string,
    filters: {
      groupId?: string;
      limit: number;
      offset: number;
    }
  ) {
    try {
      // Get requests where:
      // 1. Status is PENDING
      // 2. Either targetUserId is null (anyone can accept) OR targetUserId === userId
      // 3. Not created by the user themselves
      const where: any = {
        status: "PENDING",
        requestedBy: { not: userId },
        OR: [
          { targetUserId: null },
          { targetUserId: userId }
        ]
      };

      if (filters.groupId) {
        where.assignment = {
          task: {
            groupId: filters.groupId
          }
        };
      }

      const [requests, total] = await Promise.all([
        prisma.swapRequest.findMany({
          where,
          include: {
            assignment: {
              include: {
                task: {
                  select: {
                    id: true,
                    title: true,
                    points: true,
                    executionFrequency: true,
                    group: {
                      select: {
                        id: true,
                        name: true
                      }
                    }
                  }
                },
                timeSlot: true,
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    avatarUrl: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: filters.limit,
          skip: filters.offset
        }),
        prisma.swapRequest.count({ where })
      ]);

      // Get requester info for each request
      const requestsWithDetails = await Promise.all(
        requests.map(async (request) => {
          const requester = await prisma.user.findUnique({
            where: { id: request.requestedBy },
            select: {
              id: true,
              fullName: true,
              avatarUrl: true
            }
          });

          let targetUser = null;
          if (request.targetUserId) {
            targetUser = await prisma.user.findUnique({
              where: { id: request.targetUserId },
              select: {
                id: true,
                fullName: true,
                avatarUrl: true
              }
            });
          }

          return {
            ...request,
            requester,
            targetUser
          };
        })
      );

      return {
        success: true,
        message: "Pending swap requests retrieved successfully",
        requests: requestsWithDetails,
        total
      };

    } catch (error: any) {
      console.error("SwapRequestService.getPendingSwapRequestsForUser error:", error);
      return { success: false, message: error.message || "Error retrieving pending swap requests" };
    }
  }

  // GET: Get all swap requests for a group (admin only)
  static async getGroupSwapRequests(
    groupId: string,
    userId: string,
    filters: {
      status?: string;
      limit: number;
      offset: number;
    }
  ) {
    try {
      // Check if user is admin
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId,
          groupRole: "ADMIN",
          isActive: true
        }
      });

      if (!membership) {
        return { success: false, message: "Only group admins can view all swap requests" };
      }

      const where: any = {
        assignment: {
          task: {
            groupId
          }
        }
      };

      if (filters.status) {
        where.status = filters.status;
      }

      const [requests, total] = await Promise.all([
        prisma.swapRequest.findMany({
          where,
          include: {
            assignment: {
              include: {
                task: {
                  select: {
                    id: true,
                    title: true,
                    points: true,
                    executionFrequency: true
                  }
                },
                timeSlot: true,
                user: {
                  select: {
                    id: true,
                    fullName: true,
                    avatarUrl: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: filters.limit,
          skip: filters.offset
        }),
        prisma.swapRequest.count({ where })
      ]);

      // Get requester and target user info for each request
      const requestsWithDetails = await Promise.all(
        requests.map(async (request) => {
          const requester = await prisma.user.findUnique({
            where: { id: request.requestedBy },
            select: {
              id: true,
              fullName: true,
              avatarUrl: true
            }
          });

          let targetUser = null;
          if (request.targetUserId) {
            targetUser = await prisma.user.findUnique({
              where: { id: request.targetUserId },
              select: {
                id: true,
                fullName: true,
                avatarUrl: true
              }
            });
          }

          return {
            ...request,
            requester,
            targetUser
          };
        })
      );

      return {
        success: true,
        message: "Group swap requests retrieved successfully",
        requests: requestsWithDetails,
        total
      };

    } catch (error: any) {
      console.error("SwapRequestService.getGroupSwapRequests error:", error);
      return { success: false, message: error.message || "Error retrieving group swap requests" };
    }
  }

  // GET: Get single swap request details
  static async getSwapRequestDetails(requestId: string, userId: string) {
    try {
      const swapRequest = await prisma.swapRequest.findUnique({
        where: { id: requestId },
        include: {
          assignment: {
            include: {
              task: {
                include: {
                  group: {
                    select: {
                      id: true,
                      name: true,
                      currentRotationWeek: true
                    }
                  },
                  timeSlots: {
                    orderBy: { sortOrder: 'asc' }
                  }
                }
              },
              timeSlot: true,
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

      if (!swapRequest) {
        return { success: false, message: "Swap request not found" };
      }

      // Get requester info
      const requester = await prisma.user.findUnique({
        where: { id: swapRequest.requestedBy },
        select: {
          id: true,
          fullName: true,
          avatarUrl: true
        }
      });

      // Get target user info if exists
      let targetUser = null;
      if (swapRequest.targetUserId) {
        targetUser = await prisma.user.findUnique({
          where: { id: swapRequest.targetUserId },
          select: {
            id: true,
            fullName: true,
            avatarUrl: true
          }
        });
      }

      const swapRequestWithDetails = {
        ...swapRequest,
        requester,
        targetUser
      };

      // Check if user has permission to view
      const isRequester = swapRequest.requestedBy === userId;
      const isTarget = swapRequest.targetUserId === userId;
      const isAssignee = swapRequest.assignment?.userId === userId;
      
      // Check if user is group admin
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId: swapRequest.assignment.task.groupId,
          groupRole: "ADMIN"
        }
      });
      const isAdmin = !!membership;

      if (!isRequester && !isTarget && !isAssignee && !isAdmin) {
        return { success: false, message: "You don't have permission to view this swap request" };
      }

      return {
        success: true,
        message: "Swap request details retrieved",
        swapRequest: swapRequestWithDetails
      };

    } catch (error: any) {
      console.error("SwapRequestService.getSwapRequestDetails error:", error);
      return { success: false, message: error.message || "Error retrieving swap request details" };
    }
  }

  // UPDATE: Accept a swap request
  static async acceptSwapRequest(requestId: string, userId: string) {
    try {
      // Get swap request
      const swapRequest = await prisma.swapRequest.findUnique({
        where: { id: requestId },
        include: {
          assignment: {
            include: {
              task: {
                include: {
                  group: true,
                  timeSlots: true
                }
              },
              user: true,
              timeSlot: true
            }
          }
        }
      });

      if (!swapRequest) {
        return { success: false, message: "Swap request not found" };
      }

      // Check if request is still pending
      if (swapRequest.status !== "PENDING") {
        return { success: false, message: `This swap request is already ${swapRequest.status.toLowerCase()}` };
      }

      // Check if expired
      if (swapRequest.expiresAt && swapRequest.expiresAt < new Date()) {
        await prisma.swapRequest.update({
          where: { id: requestId },
          data: { status: "EXPIRED" }
        });
        return { success: false, message: "This swap request has expired" };
      }

      // Check if user can accept
      if (swapRequest.targetUserId && swapRequest.targetUserId !== userId) {
        return { success: false, message: "This swap request was sent to a specific user" };
      }

      // Check if user is a member of the group
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId: swapRequest.assignment.task.groupId,
          isActive: true
        }
      });

      if (!membership) {
        return { success: false, message: "You are not an active member of this group" };
      }

      // Get member details
      const memberDetails = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          fullName: true,
          avatarUrl: true
        }
      });

      // Get requester details
      const requesterDetails = await prisma.user.findUnique({
        where: { id: swapRequest.requestedBy },
        select: {
          id: true,
          fullName: true,
          avatarUrl: true
        }
      });

      // Don't allow accepting your own request
      if (swapRequest.requestedBy === userId) {
        return { success: false, message: "You cannot accept your own swap request" };
      }

      const assignment = swapRequest.assignment;
      const task = assignment.task;

      // Start transaction
      const result = await prisma.$transaction(async (prisma) => {
        // 1. Update swap request status
        const updatedRequest = await prisma.swapRequest.update({
          where: { id: requestId },
          data: { 
            status: "ACCEPTED",
            targetUserId: userId // Set the actual acceptor as target
          }
        });

        // 2. Delete original assignment
        await prisma.assignment.delete({
          where: { id: assignment.id }
        });

        // 3. Create new assignment for the acceptor
        const newAssignment = await prisma.assignment.create({
          data: {
            taskId: task.id,
            userId: userId,
            dueDate: assignment.dueDate,
            points: assignment.points,
            rotationWeek: assignment.rotationWeek,
            weekStart: assignment.weekStart,
            weekEnd: assignment.weekEnd,
            assignmentDay: assignment.assignmentDay,
            completed: false,
            verified: false,
            timeSlotId: assignment.timeSlotId,
            // Add swap tracking info
            notes: assignment.notes ? 
              `${assignment.notes}\n[Swapped from ${assignment.user.fullName} on ${new Date().toISOString()}]` : 
              `[Swapped from ${assignment.user.fullName} on ${new Date().toISOString()}]`
          }
        });

        // 4. Update task's current assignee if this is the current week
        if (assignment.rotationWeek === task.group.currentRotationWeek) {
          await prisma.task.update({
            where: { id: task.id },
            data: {
              currentAssignee: userId,
              lastAssignedAt: new Date()
            }
          });
        }

        return { updatedRequest, newAssignment };
      });

      // Create notifications
      // Notify requester that their request was accepted
      await prisma.userNotification.create({
        data: {
          userId: swapRequest.requestedBy,
          type: "SWAP_ACCEPTED",
          title: "Swap Request Accepted",
          message: `${memberDetails?.fullName || "A user"} accepted your swap request for "${task.title}"`,
          data: {
            swapRequestId: requestId,
            assignmentId: result.newAssignment.id,
            taskId: task.id,
            groupId: task.groupId,
            acceptorId: userId,
            acceptorName: memberDetails?.fullName
          }
        }
      });

      // Notify acceptor
      await prisma.userNotification.create({
        data: {
          userId,
          type: "SWAP_COMPLETED",
          title: "Swap Completed",
          message: `You have successfully swapped assignments with ${requesterDetails?.fullName || "another user"} for "${task.title}"`,
          data: {
            swapRequestId: requestId,
            assignmentId: result.newAssignment.id,
            taskId: task.id,
            groupId: task.groupId,
            requesterId: swapRequest.requestedBy,
            requesterName: requesterDetails?.fullName
          }
        }
      });

      // Notify admins
      const admins = await prisma.groupMember.findMany({
        where: {
          groupId: task.groupId,
          groupRole: "ADMIN",
          isActive: true
        },
        select: { userId: true }
      });

      for (const admin of admins) {
        await prisma.userNotification.create({
          data: {
            userId: admin.userId,
            type: "SWAP_ADMIN_NOTIFICATION",
            title: "Task Swapped",
            message: `${requesterDetails?.fullName || "A user"} and ${memberDetails?.fullName || "another user"} swapped "${task.title}"`,
            data: {
              swapRequestId: requestId,
              taskId: task.id,
              groupId: task.groupId,
              fromUserId: swapRequest.requestedBy,
              toUserId: userId,
              fromUserName: requesterDetails?.fullName,
              toUserName: memberDetails?.fullName,
              assignmentId: result.newAssignment.id
            }
          }
        });
      }

      // Get the updated swap request with details
      const updatedSwapRequest = await prisma.swapRequest.findUnique({
        where: { id: requestId },
        include: {
          assignment: {
            include: {
              task: {
                select: {
                  id: true,
                  title: true
                }
              },
              user: {
                select: {
                  id: true,
                  fullName: true
                }
              }
            }
          }
        }
      });

      return {
        success: true,
        message: "Swap request accepted successfully",
        swapRequest: {
          ...updatedSwapRequest,
          requester: requesterDetails,
          targetUser: memberDetails
        },
        newAssignment: result.newAssignment,
        previousAssignee: {
          id: assignment.userId,
          name: assignment.user.fullName
        }
      };

    } catch (error: any) {
      console.error("SwapRequestService.acceptSwapRequest error:", error);
      return { success: false, message: error.message || "Error accepting swap request" };
    }
  }

  // UPDATE: Reject a swap request
  static async rejectSwapRequest(
    requestId: string, 
    userId: string, 
    reason?: string
  ) {
    try {
      const swapRequest = await prisma.swapRequest.findUnique({
        where: { id: requestId },
        include: {
          assignment: {
            include: {
              task: true,
              user: true
            }
          }
        }
      });

      if (!swapRequest) {
        return { success: false, message: "Swap request not found" };
      }

      // Check if request is still pending
      if (swapRequest.status !== "PENDING") {
        return { success: false, message: `This swap request is already ${swapRequest.status.toLowerCase()}` };
      }

      // Check if user can reject (target user or admin)
      const isTarget = swapRequest.targetUserId === userId;
      const isRequester = swapRequest.requestedBy === userId;
      
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId: swapRequest.assignment.task.groupId,
          groupRole: "ADMIN"
        }
      });
      const isAdmin = !!membership;

      if (!isTarget && !isAdmin && !isRequester) {
        return { success: false, message: "You don't have permission to reject this swap request" };
      }

      // Get user details for notification
      const userDetails = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true }
      });

      // Update swap request status
      const updatedRequest = await prisma.swapRequest.update({
        where: { id: requestId },
        data: { 
          status: "REJECTED",
          reason: reason || undefined
        }
      });

      // Notify requester if rejected by someone else
      if (!isRequester) {
        await prisma.userNotification.create({
          data: {
            userId: swapRequest.requestedBy,
            type: "SWAP_REJECTED",
            title: "Swap Request Rejected",
            message: `${userDetails?.fullName || "A user"} rejected your swap request for "${swapRequest.assignment.task.title}"`,
            data: {
              swapRequestId: requestId,
              assignmentId: swapRequest.assignmentId,
              taskId: swapRequest.assignment.taskId,
              groupId: swapRequest.assignment.task.groupId,
              rejectedBy: userId,
              reason: reason
            }
          }
        });
      }

      return {
        success: true,
        message: "Swap request rejected successfully",
        swapRequest: updatedRequest
      };

    } catch (error: any) {
      console.error("SwapRequestService.rejectSwapRequest error:", error);
      return { success: false, message: error.message || "Error rejecting swap request" };
    }
  }

  // UPDATE: Cancel a swap request (only by requester)
  static async cancelSwapRequest(requestId: string, userId: string) {
    try {
      const swapRequest = await prisma.swapRequest.findUnique({
        where: { id: requestId }
      });

      if (!swapRequest) {
        return { success: false, message: "Swap request not found" };
      }

      // Only requester can cancel
      if (swapRequest.requestedBy !== userId) {
        return { success: false, message: "Only the requester can cancel this swap request" };
      }

      // Can only cancel pending requests
      if (swapRequest.status !== "PENDING") {
        return { success: false, message: `Cannot cancel a ${swapRequest.status.toLowerCase()} swap request` };
      }

      // Update swap request status
      const updatedRequest = await prisma.swapRequest.update({
        where: { id: requestId },
        data: { status: "CANCELLED" }
      });

      return {
        success: true,
        message: "Swap request cancelled successfully",
        swapRequest: updatedRequest
      };

    } catch (error: any) {
      console.error("SwapRequestService.cancelSwapRequest error:", error);
      return { success: false, message: error.message || "Error cancelling swap request" };
    }
  }

  // CRON JOB: Expire old pending swap requests
  static async expireOldRequests() {
    try {
      const result = await prisma.swapRequest.updateMany({
        where: {
          status: "PENDING",
          expiresAt: {
            lt: new Date()
          }
        },
        data: {
          status: "EXPIRED"
        }
      });

      console.log(`Expired ${result.count} old swap requests`);
      return { success: true, count: result.count };

    } catch (error: any) {
      console.error("SwapRequestService.expireOldRequests error:", error);
      return { success: false, message: error.message };
    }
  }
}