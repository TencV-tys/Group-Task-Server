import prisma from "../prisma";
import { Prisma, DayOfWeek } from '@prisma/client';
import { UserNotificationService } from "./user.notification.services";
export class SwapRequestService {
  
  // CREATE: Create a new swap request with scope support

static async createSwapRequest(
  userId: string,
  assignmentId: string,
  data: {
    reason?: string;
    targetUserId?: string;
    expiresAt?: Date;
    scope?: 'week' | 'day';
    selectedDay?: string;
    selectedTimeSlotId?: string;
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

    // Validate scope selection
    if (data.scope === 'day' && !data.selectedDay) {
      return { 
        success: false, 
        message: "Please select a day to swap" 
      };
    }

    // For daily tasks with time slots, validate if time slot exists
    if (data.scope === 'day' && data.selectedTimeSlotId) {
      const timeSlotExists = assignment.task.timeSlots.some(
        slot => slot.id === data.selectedTimeSlotId
      );
      if (!timeSlotExists) {
        return { 
          success: false, 
          message: "Selected time slot does not exist for this task" 
        };
      }
    }

    // Set default expiry if not provided (48 hours from now)
    let expiresAt = data.expiresAt;
    if (!expiresAt) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);
    }

    // Create swap request with scope fields
    const swapRequest = await prisma.swapRequest.create({
      data: {
        assignmentId,
        reason: data.reason,
        status: "PENDING",
        requestedBy: userId,
        targetUserId: data.targetUserId,
        expiresAt,
        scope: data.scope || 'week',
        selectedDay: data.selectedDay,
        selectedTimeSlotId: data.selectedTimeSlotId
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
                points: true,
                timeSlots: {
                  select: {
                    id: true,
                    startTime: true,
                    endTime: true,
                    label: true
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

    // Get swap description for notifications
    const getSwapDescription = () => {
      if (data.scope === 'day') {
        if (data.selectedTimeSlotId) {
          const timeSlot = assignment.task.timeSlots.find(s => s.id === data.selectedTimeSlotId);
          return `for ${data.selectedDay} at ${timeSlot?.startTime || 'selected time'}`;
        }
        return `for ${data.selectedDay}`;
      }
      return 'for the entire week';
    };

    // ========== CREATE NOTIFICATIONS USING THE SERVICE ==========
    
    // Initialize counters
    let notifiedUsersCount = 0;
    let activeMembersList: any[] = [];
    
    // Create notification for target user if specified
    if (data.targetUserId) {
      await UserNotificationService.createNotification({
        userId: data.targetUserId,
        type: "SWAP_REQUEST",
        title: "🔄 New Swap Request",
        message: `${assignment.user.fullName || "A user"} wants to swap "${assignment.task.title}" ${getSwapDescription()} with you`,
        data: {
          swapRequestId: swapRequest.id,
          assignmentId,
          taskId: assignment.taskId,
          taskTitle: assignment.task.title,
          groupId: assignment.task.groupId,
          groupName: assignment.task.group.name,
          requesterId: userId,
          requesterName: assignment.user.fullName,
          requesterAvatar: assignment.user.avatarUrl,
          dueDate: assignment.dueDate,
          scope: data.scope,
          selectedDay: data.selectedDay,
          selectedTimeSlotId: data.selectedTimeSlotId,
          reason: data.reason,
          expiresAt
        }
      });
      notifiedUsersCount = 1;
    } else {
      // Notify all active members if request is open to anyone
      activeMembersList = await prisma.groupMember.findMany({
        where: {
          groupId: assignment.task.groupId,
          isActive: true,
          userId: { not: userId } // Exclude requester
        },
        select: { userId: true }
      });

      for (const member of activeMembersList) {
        await UserNotificationService.createNotification({
          userId: member.userId,
          type: "SWAP_REQUEST",
          title: "🔄 Swap Request Available",
          message: `${assignment.user.fullName || "A user"} is looking to swap "${assignment.task.title}" ${getSwapDescription()}`,
          data: {
            swapRequestId: swapRequest.id,
            assignmentId,
            taskId: assignment.taskId,
            taskTitle: assignment.task.title,
            groupId: assignment.task.groupId,
            groupName: assignment.task.group.name,
            requesterId: userId,
            requesterName: assignment.user.fullName,
            requesterAvatar: assignment.user.avatarUrl,
            dueDate: assignment.dueDate,
            scope: data.scope,
            selectedDay: data.selectedDay,
            selectedTimeSlotId: data.selectedTimeSlotId,
            reason: data.reason,
            expiresAt
          }
        });
      }
      notifiedUsersCount = activeMembersList.length;
    }

    // Notify admins about the swap request
    const admins = await prisma.groupMember.findMany({
      where: {
        groupId: assignment.task.groupId,
        groupRole: "ADMIN",
        isActive: true,
        userId: { not: userId }
      },
      select: { userId: true }
    });

    for (const admin of admins) {
      await UserNotificationService.createNotification({
        userId: admin.userId,
        type: "SWAP_ADMIN_NOTIFICATION",
        title: "🔄 New Swap Request",
        message: `${assignment.user.fullName || "A user"} created a swap request for "${assignment.task.title}" ${getSwapDescription()}`,
        data: {
          swapRequestId: swapRequest.id,
          assignmentId,
          taskId: assignment.taskId,
          taskTitle: assignment.task.title,
          groupId: assignment.task.groupId,
          groupName: assignment.task.group.name,
          requesterId: userId,
          requesterName: assignment.user.fullName,
          scope: data.scope,
          selectedDay: data.selectedDay,
          selectedTimeSlotId: data.selectedTimeSlotId
        }
      });
    }

    return {
      success: true,
      message: data.scope === 'day' 
        ? `Swap request created for ${data.selectedDay}!` 
        : "Swap request created for the entire week!",
      swapRequest: {
        ...swapRequestWithDetails,
        requester // Add requester info manually
      },
      notifications: {
        notifiedUsers: notifiedUsersCount,
        notifiedAdmins: admins.length
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
                    },
                    timeSlots: {
                      select: {
                        id: true,
                        startTime: true,
                        endTime: true,
                        label: true
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

          // Get selected time slot details if exists
          let selectedTimeSlot = null;
          if (request.selectedTimeSlotId && request.assignment?.task?.timeSlots) {
            selectedTimeSlot = request.assignment.task.timeSlots.find(
              (slot: any) => slot.id === request.selectedTimeSlotId
            );
          }

          return {
            ...request,
            requester,
            targetUser,
            selectedTimeSlot
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
                    },
                    timeSlots: {
                      select: {
                        id: true,
                        startTime: true,
                        endTime: true,
                        label: true
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

          // Get selected time slot details if exists
          let selectedTimeSlot = null;
          if (request.selectedTimeSlotId && request.assignment?.task?.timeSlots) {
            selectedTimeSlot = request.assignment.task.timeSlots.find(
              (slot: any) => slot.id === request.selectedTimeSlotId
            );
          }

          return {
            ...request,
            requester,
            targetUser,
            selectedTimeSlot
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
                    executionFrequency: true,
                    timeSlots: {
                      select: {
                        id: true,
                        startTime: true,
                        endTime: true,
                        label: true
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

          // Get selected time slot details if exists
          let selectedTimeSlot = null;
          if (request.selectedTimeSlotId && request.assignment?.task?.timeSlots) {
            selectedTimeSlot = request.assignment.task.timeSlots.find(
              (slot: any) => slot.id === request.selectedTimeSlotId
            );
          }

          return {
            ...request,
            requester,
            targetUser,
            selectedTimeSlot
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

  // In your backend swapRequest.services.ts
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

    // Check if expired and update status if needed
    if (swapRequest.status === 'PENDING' && 
        swapRequest.expiresAt && 
        swapRequest.expiresAt < new Date()) {
      
      await prisma.swapRequest.update({
        where: { id: requestId },
        data: { status: "EXPIRED" }
      });
      
      swapRequest.status = "EXPIRED";
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

    // Get selected time slot details if exists
    let selectedTimeSlot = null;
    if (swapRequest.selectedTimeSlotId && swapRequest.assignment?.task?.timeSlots) {
      selectedTimeSlot = swapRequest.assignment.task.timeSlots.find(
        (slot: any) => slot.id === swapRequest.selectedTimeSlotId
      );
    }

    const swapRequestWithDetails = {
      ...swapRequest,
      requester,
      targetUser,
      selectedTimeSlot
    };

    // Check if user has permission to view
    const isRequester = swapRequest.requestedBy === userId;
    const isTarget = swapRequest.targetUserId === userId;
    const isAssignee = swapRequest.assignment?.userId === userId;
    
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
      message: swapRequest.status === 'EXPIRED' 
        ? "This swap request has expired" 
        : "Swap request details retrieved",
      swapRequest: swapRequestWithDetails
    };

  } catch (error: any) {
    console.error("SwapRequestService.getSwapRequestDetails error:", error);
    return { success: false, message: error.message || "Error retrieving swap request details" };
  }
}
 
// In services/swapRequest.services.ts - UPDATED acceptSwapRequest method

static async acceptSwapRequest(requestId: string, userId: string) {
  try {
    // Get swap request with all needed relations
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
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true
              }
            },
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
    const currentWeek = task.group.currentRotationWeek;

    // Initialize variables
    let updatedRequest;
    let newAssignment = null;
    let newAssignments = [] as any;
    let transferredCount = 0;
    
    if (swapRequest.scope === 'day' && swapRequest.selectedDay) {
      // ============= DAY SCOPE - TRANSFER ONLY SPECIFIC DAY =============
      console.log(`🔄 Processing DAY swap for ${swapRequest.selectedDay}`);
      
      const transactionResult = await prisma.$transaction(async (prisma) => {
        // 1. Update swap request status
        const updated = await prisma.swapRequest.update({
          where: { id: requestId },
          data: { 
            status: "ACCEPTED",
            targetUserId: userId
          }
        });

        // Build where clause for assignments to transfer - ONLY for the selected day
        const whereClause: any = {
          taskId: task.id,
          userId: assignment.userId,
          rotationWeek: currentWeek,
          assignmentDay: swapRequest.selectedDay as DayOfWeek
        };

        // Add time slot filter if specified
        if (swapRequest.selectedTimeSlotId) {
          whereClause.timeSlotId = swapRequest.selectedTimeSlotId;
          console.log(`🎯 Filtering for specific time slot: ${swapRequest.selectedTimeSlotId}`);
        }

        // Get the assignments to transfer (should be 1 for that specific day)
        const assignmentsToTransfer = await prisma.assignment.findMany({
          where: whereClause
        });

        if (assignmentsToTransfer.length === 0) {
          throw new Error(`No assignment found for day ${swapRequest.selectedDay}`);
        }

        console.log(`📦 Found ${assignmentsToTransfer.length} assignment(s) for day ${swapRequest.selectedDay}`);

        // Delete original assignments
        await prisma.assignment.deleteMany({
          where: whereClause
        });

        // Create new assignments for the acceptor (for that specific day only)
        const createdAssignments = [];
        for (const original of assignmentsToTransfer) {
          const created = await prisma.assignment.create({
            data: {
              taskId: task.id,
              userId: userId,
              dueDate: original.dueDate,
              points: original.points,
              rotationWeek: currentWeek,
              weekStart: original.weekStart,
              weekEnd: original.weekEnd,
              assignmentDay: original.assignmentDay,
              completed: false,
              verified: false,
              timeSlotId: original.timeSlotId,
              notes: `[Swapped from ${assignment.user.fullName} for ${original.assignmentDay} on ${new Date().toISOString()}]`
            }
          });
          createdAssignments.push(created);
        }

        return {
          updatedRequest: updated,
          newAssignments: createdAssignments,
          transferredCount: assignmentsToTransfer.length
        };
      });
      
      updatedRequest = transactionResult.updatedRequest;
      newAssignments = transactionResult.newAssignments;
      transferredCount = transactionResult.transferredCount;
      
    } else {
      // ============= WEEK SCOPE (Default) =============
      console.log(`🔄 Processing WEEK swap for entire week`);
      
      const transactionResult = await prisma.$transaction(async (prisma) => {
        // 1. Update swap request status
        const updated = await prisma.swapRequest.update({
          where: { id: requestId },
          data: { 
            status: "ACCEPTED",
            targetUserId: userId
          }
        });

        // Get all assignments for the week
        const assignmentsToTransfer = await prisma.assignment.findMany({
          where: {
            taskId: task.id,
            userId: assignment.userId,
            rotationWeek: currentWeek
          }
        });

        console.log(`📦 Found ${assignmentsToTransfer.length} assignment(s) for the week`);

        // Delete ALL assignments for the week
        await prisma.assignment.deleteMany({
          where: {
            taskId: task.id,
            userId: assignment.userId,
            rotationWeek: currentWeek
          }
        });

        // Create new assignments for the acceptor for the entire week
        const createdAssignments = [];
        for (const original of assignmentsToTransfer) {
          const created = await prisma.assignment.create({
            data: {
              taskId: task.id,
              userId: userId,
              dueDate: original.dueDate,
              points: original.points,
              rotationWeek: currentWeek,
              weekStart: original.weekStart,
              weekEnd: original.weekEnd,
              assignmentDay: original.assignmentDay,
              completed: false,
              verified: false,
              timeSlotId: original.timeSlotId,
              notes: original.notes ? 
                `${original.notes}\n[Swapped from ${assignment.user.fullName} on ${new Date().toISOString()}]` : 
                `[Swapped from ${assignment.user.fullName} on ${new Date().toISOString()}]`
            }
          });
          createdAssignments.push(created);
        }

        // Update task's current assignee for week swap
        if (currentWeek === task.group.currentRotationWeek) {
          await prisma.task.update({
            where: { id: task.id },
            data: {
              currentAssignee: userId,
              lastAssignedAt: new Date()
            }
          });
        }

        return {
          updatedRequest: updated,
          newAssignments: createdAssignments,
          transferredCount: assignmentsToTransfer.length
        };
      });
      
      updatedRequest = transactionResult.updatedRequest;
      newAssignments = transactionResult.newAssignments;
      transferredCount = transactionResult.transferredCount;
    }

    // Create success message based on scope
    let successMessage = "";
    if (swapRequest.scope === 'day') {
      if (swapRequest.selectedTimeSlotId) {
        const timeSlot = task.timeSlots.find(s => s.id === swapRequest.selectedTimeSlotId);
        successMessage = `Swap request accepted! You've taken over ${swapRequest.selectedDay}'s ${timeSlot?.startTime || ''} slot.`;
      } else {
        successMessage = `Swap request accepted! You've taken over ${swapRequest.selectedDay}'s assignments.`;
      }
    } else {
      successMessage = `Swap request accepted successfully! You've taken over ${transferredCount} assignment(s) for the week.`;
    }

    // ============= CREATE NOTIFICATIONS USING THE SERVICE =============
    
    // Notify requester that their request was accepted
    await UserNotificationService.createNotification({
      userId: swapRequest.requestedBy,
      type: "SWAP_ACCEPTED",
      title: "✅ Swap Request Accepted",
      message: `${memberDetails?.fullName || "A user"} accepted your swap request for "${task.title}"${
        swapRequest.scope === 'day' ? ` on ${swapRequest.selectedDay}` : ''
      }`,
      data: {
        swapRequestId: requestId,
        taskId: task.id,
        taskTitle: task.title,
        groupId: task.groupId,
        groupName: task.group.name,
        acceptorId: userId,
        acceptorName: memberDetails?.fullName,
        acceptorAvatar: memberDetails?.avatarUrl,
        scope: swapRequest.scope,
        selectedDay: swapRequest.selectedDay,
        selectedTimeSlotId: swapRequest.selectedTimeSlotId,
        transferredCount
      }
    });

    // Notify acceptor
    await UserNotificationService.createNotification({
      userId,
      type: "SWAP_COMPLETED",
      title: "🔄 Swap Completed",
      message: `You have successfully swapped assignments with ${requesterDetails?.fullName || "another user"} for "${task.title}"${
        swapRequest.scope === 'day' ? ` on ${swapRequest.selectedDay}` : ''
      }`,
      data: {
        swapRequestId: requestId,
        taskId: task.id,
        taskTitle: task.title,
        groupId: task.groupId,
        groupName: task.group.name,
        requesterId: swapRequest.requestedBy,
        requesterName: requesterDetails?.fullName,
        requesterAvatar: requesterDetails?.avatarUrl,
        scope: swapRequest.scope,
        selectedDay: swapRequest.selectedDay,
        selectedTimeSlotId: swapRequest.selectedTimeSlotId,
        transferredCount
      }
    });

    // Notify admins
    const admins = await prisma.groupMember.findMany({
      where: {
        groupId: task.groupId,
        groupRole: "ADMIN",
        isActive: true,
        userId: { notIn: [userId, swapRequest.requestedBy] }
      },
      select: { userId: true }
    });

    for (const admin of admins) {
      await UserNotificationService.createNotification({
        userId: admin.userId,
        type: "SWAP_ADMIN_NOTIFICATION",
        title: "🔄 Task Swapped",
        message: `${requesterDetails?.fullName || "A user"} and ${memberDetails?.fullName || "another user"} swapped "${task.title}"${
          swapRequest.scope === 'day' ? ` on ${swapRequest.selectedDay}` : ''
        }`,
        data: {
          swapRequestId: requestId,
          taskId: task.id,
          taskTitle: task.title,
          groupId: task.groupId,
          groupName: task.group.name,
          fromUserId: swapRequest.requestedBy,
          toUserId: userId,
          fromUserName: requesterDetails?.fullName,
          toUserName: memberDetails?.fullName,
          scope: swapRequest.scope,
          selectedDay: swapRequest.selectedDay,
          selectedTimeSlotId: swapRequest.selectedTimeSlotId,
          transferredCount
        }
      });
    }

    // Get the updated swap request with details for response
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

    // ============= RETURN COMPLETE RESPONSE WITH ALL FIELDS =============
    
    // Base response object with ALL fields
    const response: any = {
      success: true,
      message: successMessage,
      swapRequest: {
        ...updatedSwapRequest,
        requester: requesterDetails,
        targetUser: memberDetails
      },
      previousAssignee: {
        id: assignment.userId,
        name: assignment.user.fullName
      },
      scope: swapRequest.scope,
      selectedDay: swapRequest.selectedDay,
      selectedTimeSlotId: swapRequest.selectedTimeSlotId,
      transferredCount,
      notifications: {
        notifiedRequester: true,
        notifiedAcceptor: true,
        notifiedAdmins: admins.length
      }
    };

    // Add scope-specific fields
    if (swapRequest.scope === 'week') {
      response.newAssignments = newAssignments;
    } else {
      response.newAssignments = newAssignments;
      response.transferredCount = transferredCount;
    }

    return response;

  } catch (error: any) {
    console.error("SwapRequestService.acceptSwapRequest error:", error);
    return { 
      success: false, 
      message: error.message || "Error accepting swap request" 
    };
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
        select: { fullName: true, avatarUrl: true }
      });

      // Update swap request status
      const updatedRequest = await prisma.swapRequest.update({
        where: { id: requestId },
        data: { 
          status: "REJECTED",
          reason: reason || undefined
        }
      });

      // ========== CREATE NOTIFICATIONS ==========
      
      // Notify requester if rejected by someone else
      if (!isRequester) {
        await UserNotificationService.createNotification({
          userId: swapRequest.requestedBy,
          type: "SWAP_REJECTED",
          title: "❌ Swap Request Rejected",
          message: `${userDetails?.fullName || "A user"} rejected your swap request for "${swapRequest.assignment.task.title}"${
            swapRequest.scope === 'day' ? ` on ${swapRequest.selectedDay}` : ''
          }`,
          data: {
            swapRequestId: requestId,
            assignmentId: swapRequest.assignmentId,
            taskId: swapRequest.assignment.taskId,
            taskTitle: swapRequest.assignment.task.title,
            groupId: swapRequest.assignment.task.groupId,
            rejectedBy: userId,
            rejectedByName: userDetails?.fullName,
            reason: reason,
            scope: swapRequest.scope,
            selectedDay: swapRequest.selectedDay
          }
        });
      }

      // If rejected by admin, also notify target user if exists
      if (isAdmin && swapRequest.targetUserId && swapRequest.targetUserId !== swapRequest.requestedBy) {
        await UserNotificationService.createNotification({
          userId: swapRequest.targetUserId,
          type: "SWAP_REJECTED",
          title: "❌ Swap Request Rejected",
          message: `An admin rejected the swap request for "${swapRequest.assignment.task.title}" that was meant for you`,
          data: {
            swapRequestId: requestId,
            taskId: swapRequest.assignment.taskId,
            taskTitle: swapRequest.assignment.task.title,
            groupId: swapRequest.assignment.task.groupId,
            rejectedBy: userId,
            rejectedByName: userDetails?.fullName,
            reason: reason
          }
        });
      }

      return {
        success: true,
        message: "Swap request rejected successfully",
        swapRequest: updatedRequest,
        notifications: {
          notifiedRequester: !isRequester,
          notifiedTarget: isAdmin && !!swapRequest.targetUserId
        }
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
        where: { id: requestId },
        include: {
          assignment: {
            include: {
              task: true
            }
          }
        }
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

      // Get requester details
      const requesterDetails = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true }
      });

      // Update swap request status
      const updatedRequest = await prisma.swapRequest.update({
        where: { id: requestId },
        data: { status: "CANCELLED" }
      });

      // ========== CREATE NOTIFICATIONS ==========
      
      // Notify target user if exists
      if (swapRequest.targetUserId) {
        await UserNotificationService.createNotification({
          userId: swapRequest.targetUserId,
          type: "SWAP_CANCELLED",
          title: "✖️ Swap Request Cancelled",
          message: `${requesterDetails?.fullName || "A user"} cancelled their swap request for "${swapRequest.assignment.task.title}"`,
          data: {
            swapRequestId: requestId,
            taskId: swapRequest.assignment.taskId,
            taskTitle: swapRequest.assignment.task.title,
            groupId: swapRequest.assignment.task.groupId
          }
        });
      }

      // Notify admins
      const admins = await prisma.groupMember.findMany({
        where: {
          groupId: swapRequest.assignment.task.groupId,
          groupRole: "ADMIN",
          isActive: true,
          userId: { not: userId }
        },
        select: { userId: true }
      });

      for (const admin of admins) {
        await UserNotificationService.createNotification({
          userId: admin.userId,
          type: "SWAP_ADMIN_NOTIFICATION",
          title: "✖️ Swap Request Cancelled",
          message: `${requesterDetails?.fullName || "A user"} cancelled their swap request for "${swapRequest.assignment.task.title}"`,
          data: {
            swapRequestId: requestId,
            taskId: swapRequest.assignment.taskId,
            taskTitle: swapRequest.assignment.task.title,
            groupId: swapRequest.assignment.task.groupId,
            cancelledBy: userId,
            cancelledByName: requesterDetails?.fullName
          }
        });
      }

      return {
        success: true,
        message: "Swap request cancelled successfully",
        swapRequest: updatedRequest,
        notifications: {
          notifiedTarget: !!swapRequest.targetUserId,
          notifiedAdmins: admins.length
        }
      };

    } catch (error: any) {
      console.error("SwapRequestService.cancelSwapRequest error:", error);
      return { success: false, message: error.message || "Error cancelling swap request" };
    }
  }

  // CRON JOB: Expire old pending swap requests
  static async expireOldRequests() {
    try {
      const expiredRequests = await prisma.swapRequest.findMany({
        where: {
          status: "PENDING",
          expiresAt: {
            lt: new Date()
          }
        },
        include: {
          assignment: {
            include: {
              task: true
            }
          }
        }
      });

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

      // Notify users about expired requests
      for (const request of expiredRequests) {
        // Notify requester
        await UserNotificationService.createNotification({
          userId: request.requestedBy,
          type: "SWAP_EXPIRED",
          title: "⏰ Swap Request Expired",
          message: `Your swap request for "${request.assignment.task.title}" has expired`,
          data: {
            swapRequestId: request.id,
            taskId: request.assignment.taskId,
            taskTitle: request.assignment.task.title
          }
        });

        // Notify target user if exists
        if (request.targetUserId) {
          await UserNotificationService.createNotification({
            userId: request.targetUserId,
            type: "SWAP_EXPIRED",
            title: "⏰ Swap Request Expired",
            message: `A swap request for "${request.assignment.task.title}" has expired`,
            data: {
              swapRequestId: request.id,
              taskId: request.assignment.taskId,
              taskTitle: request.assignment.task.title
            }
          });
        }
      }

      console.log(`Expired ${result.count} old swap requests`);
      return { success: true, count: result.count, notifiedUsers: expiredRequests.length * 2 };

    } catch (error: any) {
      console.error("SwapRequestService.expireOldRequests error:", error);
      return { success: false, message: error.message };
    }
  }
}