// services/swapRequest.services.ts - COMPLETE FIXED VERSION
import prisma from "../prisma";
import { Prisma, DayOfWeek } from '@prisma/client';
import { UserNotificationService } from "./user.notification.services";
import { SocketService } from "./socket.services";

export class SwapRequestService {
 

  // services/swapRequest.services.ts - COMPLETE UPDATED createSwapRequest

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
            group: {
              include: {
                tasks: {
                  where: { 
                    isRecurring: true,
                    isDeleted: false 
                  },
                  orderBy: { createdAt: 'asc' },
                  take: 1,
                  select: { 
                    id: true,
                    createdAt: true 
                  }
                }
              }
            },
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

    if (!assignment.task) {
      return { 
        success: false, 
        message: "The task associated with this assignment has been deleted and cannot be swapped" 
      };
    }

    if (assignment.userId !== userId) {
      return { success: false, message: "You can only request swap for your own assignments" };
    }

    if (assignment.completed) {
      return { success: false, message: "Cannot swap completed assignments" };
    }

    // Check if user is still a member of the group and in rotation
    const membership = await prisma.groupMember.findFirst({
      where: {
        userId,
        groupId: assignment.task.groupId,
        isActive: true,
        inRotation: true
      }
    });

    if (!membership) {
      return { success: false, message: "You must be an active member in rotation to request swaps" };
    }

    // ========== DAY SWAP VALIDATION ==========
    if (data.scope === 'day') {
      if (!data.selectedDay) {
        return { 
          success: false, 
          message: "Please select a day to swap" 
        };
      }

      // ✅ Check if requester actually has a task that day
      const requesterAssignment = await prisma.assignment.findFirst({
        where: {
          userId,
          taskId: assignment.taskId,
          rotationWeek: assignment.rotationWeek,
          assignmentDay: data.selectedDay as DayOfWeek
        }
      });

      if (!requesterAssignment) {
        return { 
          success: false, 
          message: `You don't have any tasks on ${data.selectedDay} to swap` 
        };
      }

      // ✅ For daily tasks with time slots, validate time slot exists
      if (data.selectedTimeSlotId && assignment.task.timeSlots) {
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

      // ✅ Check if there are any members who CAN accept (no task that day)
      if (!data.targetUserId) {
        const availableMembers = await prisma.groupMember.findMany({
          where: {
            groupId: assignment.task.groupId,
            isActive: true,
            inRotation: true,
            userId: { not: userId }
          },
          include: {
            user: {
              select: { fullName: true }
            }
          }
        });

        const membersWithNoTask = [];
        
        for (const member of availableMembers) {
          const existingAssignment = await prisma.assignment.findFirst({
            where: {
              userId: member.userId,
              taskId: assignment.taskId,
              rotationWeek: assignment.rotationWeek,
              assignmentDay: data.selectedDay as DayOfWeek
            }
          });
          
          if (!existingAssignment) {
            membersWithNoTask.push(member.user.fullName);
          }
        }

        if (membersWithNoTask.length === 0) {
          return { 
            success: false, 
            message: `No members available to accept this day swap. All members already have tasks on ${data.selectedDay}.` 
          };
        }
      }
    }

    // ========== WEEK SWAP VALIDATION ==========
    if (data.scope === 'week') {
      // For week swaps, validate time constraints
      const firstTask = assignment.task.group?.tasks?.[0];
      if (!firstTask) {
        return { 
          success: false, 
          message: "Cannot determine week start date - no tasks found" 
        };
      }

      const firstTaskDate = new Date(firstTask.createdAt);
      const firstTaskDay = firstTaskDate.getDay();
      
      let daysSinceWeekStart = new Date().getDay() - firstTaskDay;
      if (daysSinceWeekStart < 0) daysSinceWeekStart += 7;
      
      const weekStart = new Date();
      weekStart.setDate(new Date().getDate() - daysSinceWeekStart);
      weekStart.setHours(0, 0, 0, 0);
      
      const hoursSinceWeekStart = (new Date().getTime() - weekStart.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceWeekStart > 24) {
        const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return { 
          success: false, 
          message: `Week swap window has closed (only available within first 24 hours of the week, which started on ${weekDayNames[firstTaskDay]})` 
        };
      }
    }

    // ========== TARGET USER VALIDATION ==========
    if (data.targetUserId) {
      const targetMembership = await prisma.groupMember.findFirst({
        where: {
          userId: data.targetUserId,
          groupId: assignment.task.groupId,
          isActive: true,
          inRotation: true
        }
      });

      if (!targetMembership) {
        return { 
          success: false, 
          message: "Target user is not an active member in rotation" 
        };
      }

      if (data.targetUserId === userId) {
        return { success: false, message: "Cannot swap assignment with yourself" };
      }

      // ✅ For DAY swaps with specific target, check if target has a task that day
      if (data.scope === 'day' && data.selectedDay) {
        const targetAssignment = await prisma.assignment.findFirst({
          where: {
            userId: data.targetUserId,
            taskId: assignment.taskId,
            rotationWeek: assignment.rotationWeek,
            assignmentDay: data.selectedDay as DayOfWeek
          }
        });

        if (targetAssignment) {
          return { 
            success: false, 
            message: `Target user already has a task on ${data.selectedDay}. Only users without a task can accept day swaps.` 
          };
        }
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

    // Set default expiry if not provided (48 hours from now)
    let expiresAt = data.expiresAt;
    if (!expiresAt) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);
    }

    // Create swap request
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

    // Get swap request with details
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

    const requester = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true
      }
    });

    const getSwapDescription = () => {
      if (data.scope === 'day') {
        if (data.selectedTimeSlotId && assignment.task?.timeSlots) {
          const timeSlot = assignment.task.timeSlots.find(s => s.id === data.selectedTimeSlotId);
          return `for ${data.selectedDay} at ${timeSlot?.startTime || 'selected time'}`;
        }
        return `for ${data.selectedDay}`;
      }
      return 'for the entire week';
    };

    // ========== CREATE NOTIFICATIONS ==========
    let notifiedUsersCount = 0;
    
    if (data.targetUserId) {
      // Notify specific target user
      await UserNotificationService.createNotification({
        userId: data.targetUserId,
        type: "SWAP_REQUEST",
        title: "🔄 New Swap Request",
        message: `${assignment.user?.fullName || "A user"} wants to swap "${assignment.task.title}" ${getSwapDescription()} with you`,
        data: {
          swapRequestId: swapRequest.id,
          assignmentId,
          taskId: assignment.taskId,
          taskTitle: assignment.task.title,
          groupId: assignment.task.groupId,
          groupName: assignment.task.group?.name || 'Group',
          requesterId: userId,
          requesterName: assignment.user?.fullName || 'Unknown',
          requesterAvatar: assignment.user?.avatarUrl,
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
      // Notify all eligible members (for DAY swaps: only those without a task that day)
      const activeMembers = await prisma.groupMember.findMany({
        where: {
          groupId: assignment.task.groupId,
          isActive: true,
          inRotation: true,
          userId: { not: userId }
        },
        select: { userId: true }
      });

      let eligibleMembers = activeMembers;
      
      // For DAY swaps, filter members who have no task that day
      if (data.scope === 'day' && data.selectedDay) {
        const eligibleList = [];
        for (const member of activeMembers) {
          const existingAssignment = await prisma.assignment.findFirst({
            where: {
              userId: member.userId,
              taskId: assignment.taskId,
              rotationWeek: assignment.rotationWeek,
              assignmentDay: data.selectedDay as DayOfWeek
            }
          });
          if (!existingAssignment) {
            eligibleList.push(member);
          }
        }
        eligibleMembers = eligibleList;
        
        if (eligibleMembers.length === 0) {
          console.log(`⚠️ No eligible members to notify for day swap on ${data.selectedDay}`);
        }
      }

      for (const member of eligibleMembers) {
        await UserNotificationService.createNotification({
          userId: member.userId,
          type: "SWAP_REQUEST",
          title: "🔄 Swap Request Available",
          message: `${assignment.user?.fullName || "A user"} is looking to swap "${assignment.task.title}" ${getSwapDescription()}`,
          data: {
            swapRequestId: swapRequest.id,
            assignmentId,
            taskId: assignment.taskId,
            taskTitle: assignment.task.title,
            groupId: assignment.task.groupId,
            groupName: assignment.task.group?.name || 'Group',
            requesterId: userId,
            requesterName: assignment.user?.fullName || 'Unknown',
            requesterAvatar: assignment.user?.avatarUrl,
            dueDate: assignment.dueDate,
            scope: data.scope,
            selectedDay: data.selectedDay,
            selectedTimeSlotId: data.selectedTimeSlotId,
            reason: data.reason,
            expiresAt
          }
        });
      }
      notifiedUsersCount = eligibleMembers.length;
    }

    // 🔴 EMIT SOCKET EVENT
    await SocketService.emitSwapRequested(
      swapRequest.id,
      assignmentId,
      assignment.taskId || 'unknown-task',
      assignment.task.title,
      userId,
      assignment.user?.fullName || 'Unknown',
      assignment.task.groupId,
      (data.scope || 'week') as 'week' | 'day',
      expiresAt,
      data.targetUserId,
      data.selectedDay,
      data.selectedTimeSlotId,
      data.reason
    );

    // Notify admins
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
        message: `${assignment.user?.fullName || "A user"} created a swap request for "${assignment.task.title}" ${getSwapDescription()}`,
        data: {
          swapRequestId: swapRequest.id,
          assignmentId,
          taskId: assignment.taskId,
          taskTitle: assignment.task.title,
          groupId: assignment.task.groupId,
          groupName: assignment.task.group?.name || 'Group',
          requesterId: userId,
          requesterName: assignment.user?.fullName || 'Unknown',
          scope: data.scope,
          selectedDay: data.selectedDay,
          selectedTimeSlotId: data.selectedTimeSlotId
        }
      });
    }

    // Get week info for response
    let weekInfo = null;
    if (data.scope === 'week' && assignment.task.group?.tasks?.[0]) {
      const firstTask = assignment.task.group.tasks[0];
      const firstTaskDate = new Date(firstTask.createdAt);
      const firstTaskDay = firstTaskDate.getDay();
      const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const now = new Date();
      
      weekInfo = {
        weekStartDay: weekDayNames[firstTaskDay],
        weekNumber: Math.floor(
          (now.getTime() - firstTaskDate.getTime()) / (1000 * 60 * 60 * 24) / 7
        ) + 1
      };
    }

    return {
      success: true,
      message: data.scope === 'day' 
        ? `Swap request created for ${data.selectedDay}!` 
        : `Swap request created for the entire week! (Week starts on ${weekInfo?.weekStartDay || 'the day of first task'})`,
      swapRequest: {
        ...swapRequestWithDetails,
        requester
      },
      weekInfo,  
      notifications: { 
        notifiedUsers: notifiedUsersCount,
        notifiedAdmins: admins.length 
      },
      eligibleMembersCount: data.scope === 'day' && !data.targetUserId ? notifiedUsersCount : undefined
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

      // Filter out requests with null tasks
      const validRequests = requests.filter(r => r.assignment?.task !== null);

      // Get requester info for each request
      const requestsWithDetails = await Promise.all(
        validRequests.map(async (request) => {
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
        total: requestsWithDetails.length
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
    // ===== NEW: Check if user is in rotation =====
    if (filters.groupId) {
      const userMembership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId: filters.groupId,
          isActive: true
        }
      });

      if (userMembership && !userMembership.inRotation) {
        // User is not in rotation, they shouldn't see swap requests
        return {
          success: true,
          message: "You are not in rotation, no swap requests available",
          requests: [],
          total: 0,
          userStatus: {
            inRotation: false,
            role: userMembership.groupRole
          }
        };
      }
    }

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

    // Filter out requests with null tasks
    const validRequests = requests.filter(r => r.assignment?.task !== null);

    // Get requester info for each request
    const requestsWithDetails = await Promise.all(
      validRequests.map(async (request) => {
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
      total: requestsWithDetails.length,
      userStatus: {
        inRotation: true
      }
    };

  } catch (error: any) {
    console.error("SwapRequestService.getPendingSwapRequestsForUser error:", error);
    return { success: false, message: error.message || "Error retrieving pending swap requests" };
  }
}

// In swapRequest.services.ts - Add debug logging
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
    console.log(`📦 getGroupSwapRequests service called:`);
    console.log(`   groupId: ${groupId}`);
    console.log(`   filters.status: ${filters.status}`);

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

    // Apply status filter
    if (filters.status) {
      where.status = filters.status;
      console.log(`   ✅ Applied status filter: ${filters.status}`);
    } else {
      console.log(`   📋 No status filter applied (showing all)`);
    }

    console.log(`   📋 Final where clause:`, JSON.stringify(where, null, 2));

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

    console.log(`   ✅ Found ${requests.length} requests (total: ${total})`);
    console.log(`   Request statuses:`, requests.map(r => r.status));

    // Filter out requests with null tasks
    const validRequests = requests.filter(r => r.assignment?.task !== null);
    
    console.log(`   ✅ Valid requests after null filter: ${validRequests.length}`);

    // ... rest of the code (get requester info, etc.)
    
    // Get requester and target user info for each request
    const requestsWithDetails = await Promise.all(
      validRequests.map(async (request) => {
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
      total: validRequests.length, // ✅ Use filtered count
      stats: {
        totalMembers: await prisma.groupMember.count({ where: { groupId } }),
        membersInRotation: await prisma.groupMember.count({ where: { groupId, inRotation: true } }),
        requestsFromMembersInRotation: requestsWithDetails.filter(r => r.requester?.id).length,
        swapParticipationRate: 0
      }
    };

  } catch (error: any) {
    console.error("SwapRequestService.getGroupSwapRequests error:", error);
    return { success: false, message: error.message || "Error retrieving group swap requests" };
  }
}
 
  // GET: Get swap request details
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

      // Check if task exists
      if (!swapRequest.assignment?.task) {
        return { 
          success: false, 
          message: "The task associated with this swap request has been deleted" 
        };
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
      if (swapRequest.selectedTimeSlotId && swapRequest.assignment.task.timeSlots) {
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
 
 
// services/swapRequest.services.ts - FIXED WEEK SWAP (true exchange)
// In swapRequest.services.ts - COMPLETE UPDATED acceptSwapRequest

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

    if (!swapRequest.assignment?.task) {
      return { 
        success: false, 
        message: "The task associated with this swap request has been deleted" 
      };
    }

    if (swapRequest.status !== "PENDING") {
      return { success: false, message: `This swap request is already ${swapRequest.status.toLowerCase()}` };
    }

    if (swapRequest.expiresAt && swapRequest.expiresAt < new Date()) {
      await prisma.swapRequest.update({
        where: { id: requestId },
        data: { status: "EXPIRED" }
      });
      return { success: false, message: "This swap request has expired" };
    }

    if (swapRequest.targetUserId && swapRequest.targetUserId !== userId) {
      return { success: false, message: "This swap request was sent to a specific user" };
    }

    // Check if user is in rotation
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

    if (!membership.inRotation) {
      return { 
        success: false, 
        message: "Only members in rotation can accept swap requests" 
      };
    }

    if (swapRequest.requestedBy === userId) {
      return { success: false, message: "You cannot accept your own swap request" };
    }

    const assignment = swapRequest.assignment;
    const task = swapRequest.assignment.task;
    const currentWeek = task.group.currentRotationWeek;
    const requesterId = swapRequest.requestedBy;

    // Get member details
    const acceptorDetails = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, avatarUrl: true }
    });

    const requesterDetails = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { id: true, fullName: true, avatarUrl: true }
    });

    let updatedRequest;
    let transferredCount = 0;
    let requesterNewAssignments: any[] = [];
    let acceptorNewAssignments: any[] = [];

    if (swapRequest.scope === 'day' && swapRequest.selectedDay) {
      // ============= DAY SWAP =============
      console.log(`🔄 Processing DAY swap for ${swapRequest.selectedDay}`);
      
      let updatedRequesterAssignment;
      let updatedAcceptorAssignment;
      
      const transactionResult = await prisma.$transaction(async (prisma) => {
        const updated = await prisma.swapRequest.update({
          where: { id: requestId },
          data: { status: "ACCEPTED", targetUserId: userId }
        });

        const requesterWhere: any = {
          taskId: task.id,
          userId: requesterId,
          rotationWeek: currentWeek,
          assignmentDay: swapRequest.selectedDay as DayOfWeek
        };

        if (swapRequest.selectedTimeSlotId) {
          requesterWhere.timeSlotId = swapRequest.selectedTimeSlotId;
        }

        const requesterAssignment = await prisma.assignment.findFirst({
          where: requesterWhere
        });

        const acceptorWhere: any = {
          taskId: task.id,
          userId: userId,
          rotationWeek: currentWeek,
          assignmentDay: swapRequest.selectedDay as DayOfWeek
        };

        if (swapRequest.selectedTimeSlotId) {
          acceptorWhere.timeSlotId = swapRequest.selectedTimeSlotId;
        }

        const acceptorAssignment = await prisma.assignment.findFirst({
          where: acceptorWhere
        });

        if (!requesterAssignment) {
          throw new Error(`No assignment found for requester on ${swapRequest.selectedDay}`);
        }

        if (acceptorAssignment) {
          // Both have tasks - EXCHANGE
          const updatedReqAssign = await prisma.assignment.update({
            where: { id: requesterAssignment.id },
            data: {
              userId: userId,
              notes: `[SWAPPED: from ${requesterDetails?.fullName} to ${acceptorDetails?.fullName} on ${swapRequest.selectedDay}]`
            }
          });
          
          const updatedAccAssign = await prisma.assignment.update({
            where: { id: acceptorAssignment.id },
            data: {
              userId: requesterId,
              notes: `[SWAPPED: from ${acceptorDetails?.fullName} to ${requesterDetails?.fullName} on ${swapRequest.selectedDay}]`
            }
          });

          return {
            updatedRequest: updated,
            swappedCount: 2,
            requesterNew: [acceptorAssignment],
            acceptorNew: [requesterAssignment],
            requesterAssignment: updatedReqAssign,
            acceptorAssignment: updatedAccAssign
          };
        } else {
          // Acceptor has NO task - TRANSFER
          const updatedReqAssign = await prisma.assignment.update({
            where: { id: requesterAssignment.id },
            data: {
              userId: userId,
              notes: `[TRANSFERRED: from ${requesterDetails?.fullName} to ${acceptorDetails?.fullName} on ${swapRequest.selectedDay}]`
            }
          });

          return {
            updatedRequest: updated,
            swappedCount: 1,
            requesterNew: [],
            acceptorNew: [requesterAssignment],
            requesterAssignment: updatedReqAssign,
            acceptorAssignment: null
          };
        }
      });

      updatedRequest = transactionResult.updatedRequest;
      transferredCount = transactionResult.swappedCount;
      acceptorNewAssignments = transactionResult.acceptorNew;
      requesterNewAssignments = transactionResult.requesterNew;
      
      // ✅ EMIT SOCKET EVENTS FOR UI REFRESH - DAY SWAP
      // Notify the requester that their assignment is gone
      await SocketService.emitAssignmentUpdated(
        transactionResult.requesterAssignment.id,
        requesterId,
        task.groupId
      );
      
      // Notify the acceptor about their new assignment
      if (transactionResult.acceptorAssignment) {
        await SocketService.emitAssignmentUpdated(
          transactionResult.acceptorAssignment.id,
          userId,
          task.groupId
        );
      } else {
        // For transfer-only, the acceptor now owns the requester's old assignment
        await SocketService.emitAssignmentUpdated(
          transactionResult.requesterAssignment.id,
          userId,
          task.groupId
        );
      }

    } else {
      // ============= WEEK SWAP - TRUE EXCHANGE =============
      console.log(`🔄 Processing WEEK swap - EXCHANGING all tasks between users`);

      const transactionResult = await prisma.$transaction(async (prisma) => {
        // Update swap request status
        const updated = await prisma.swapRequest.update({
          where: { id: requestId },
          data: { status: "ACCEPTED", targetUserId: userId }
        });

        // Get ALL assignments for requester this week
        const requesterAssignments = await prisma.assignment.findMany({
          where: {
            taskId: task.id,
            userId: requesterId,
            rotationWeek: currentWeek
          }
        });

        // Get ALL assignments for acceptor this week
        const acceptorAssignments = await prisma.assignment.findMany({
          where: {
            taskId: task.id,
            userId: userId,
            rotationWeek: currentWeek
          }
        });

        console.log(`📦 Requester has ${requesterAssignments.length} assignments`);
        console.log(`📦 Acceptor has ${acceptorAssignments.length} assignments`);

        if (requesterAssignments.length === 0) {
          throw new Error("No assignments found for requester this week");
        }

        const updatedRequesterAssignments: any[] = [];
        const updatedAcceptorAssignments: any[] = [];

        // STEP 1: Update requester's assignments to acceptor
        for (const assignment of requesterAssignments) {
          const updated = await prisma.assignment.update({
            where: { id: assignment.id },
            data: {
              userId: userId,
              notes: assignment.notes ? 
                `${assignment.notes}\n[WEEK SWAP: from ${requesterDetails?.fullName} to ${acceptorDetails?.fullName}]` : 
                `[WEEK SWAP: from ${requesterDetails?.fullName} to ${acceptorDetails?.fullName}]`
            }
          });
          updatedAcceptorAssignments.push(updated);
        }

        // STEP 2: Update acceptor's assignments to requester
        for (const assignment of acceptorAssignments) {
          const updated = await prisma.assignment.update({
            where: { id: assignment.id },
            data: {
              userId: requesterId,
              notes: assignment.notes ? 
                `${assignment.notes}\n[WEEK SWAP: from ${acceptorDetails?.fullName} to ${requesterDetails?.fullName}]` : 
                `[WEEK SWAP: from ${acceptorDetails?.fullName} to ${requesterDetails?.fullName}]`
            }
          });
          updatedRequesterAssignments.push(updated);
        }

        // Update task's current assignee for the week
        await prisma.task.update({
          where: { id: task.id },
          data: {
            currentAssignee: userId,
            lastAssignedAt: new Date()
          }
        });

        console.log(`✅ WEEK SWAP completed:`);
        console.log(`   Requester (${requesterDetails?.fullName}) now has ${updatedRequesterAssignments.length} tasks`);
        console.log(`   Acceptor (${acceptorDetails?.fullName}) now has ${updatedAcceptorAssignments.length} tasks`);

        return {
          updatedRequest: updated,
          requesterCount: requesterAssignments.length,
          acceptorCount: acceptorAssignments.length,
          requesterNew: updatedRequesterAssignments,
          acceptorNew: updatedAcceptorAssignments,
          totalSwapped: requesterAssignments.length + acceptorAssignments.length,
          requesterAssignments: updatedRequesterAssignments,
          acceptorAssignments: updatedAcceptorAssignments
        };
      });

      updatedRequest = transactionResult.updatedRequest;
      transferredCount = transactionResult.totalSwapped;
      requesterNewAssignments = transactionResult.requesterNew;
      acceptorNewAssignments = transactionResult.acceptorNew;

      console.log(`✅ WEEK SWAP completed: Swapped ${transactionResult.requesterCount} assignments from requester, ${transactionResult.acceptorCount} from acceptor`);
      
      // ✅ EMIT SOCKET EVENTS FOR UI REFRESH - WEEK SWAP
      // Notify requester about all their assignments that were transferred to acceptor
      for (const assignment of transactionResult.requesterAssignments) {
        await SocketService.emitAssignmentUpdated(
          assignment.id,
          requesterId,
          task.groupId
        );
      }
      
      // Notify acceptor about their new assignments (from requester)
      for (const assignment of transactionResult.acceptorAssignments) {
        await SocketService.emitAssignmentUpdated(
          assignment.id,
          userId,
          task.groupId
        );
      }
    }

    // Create success message
    let successMessage = "";
    if (swapRequest.scope === 'day') {
      if (transferredCount === 2) {
        successMessage = `Swap completed! You and ${requesterDetails?.fullName} have exchanged ${swapRequest.selectedDay}'s assignments.`;
      } else {
        successMessage = `Swap completed! You've taken over ${swapRequest.selectedDay}'s assignment from ${requesterDetails?.fullName}.`;
      }
    } else {
      successMessage = `Week swap completed! You and ${requesterDetails?.fullName} have exchanged ALL tasks for week ${currentWeek}.\n\n` +
        `You now have ${acceptorNewAssignments.length} task(s) (from ${requesterDetails?.fullName})\n` +
        `${requesterDetails?.fullName} now has ${requesterNewAssignments.length} task(s) (from you)`;
    }

    // ============= CREATE NOTIFICATIONS =============

    // Notify requester
    await UserNotificationService.createNotification({
      userId: swapRequest.requestedBy,
      type: "SWAP_ACCEPTED",
      title: swapRequest.scope === 'week' ? "✅ Week Swap Completed" : "✅ Day Swap Completed",
      message: swapRequest.scope === 'week'
        ? `${acceptorDetails?.fullName || "A user"} has swapped the entire week with you! You now have ${requesterNewAssignments.length} tasks (from ${acceptorDetails?.fullName}) for week ${currentWeek}.`
        : `${acceptorDetails?.fullName || "A user"} has accepted your day swap for ${swapRequest.selectedDay}.`,
      data: {
        swapRequestId: requestId,
        taskId: task.id,
        taskTitle: task.title,
        groupId: task.groupId,
        groupName: task.group?.name || 'Group',
        acceptorId: userId,
        acceptorName: acceptorDetails?.fullName,
        scope: swapRequest.scope,
        selectedDay: swapRequest.selectedDay,
        transferredCount,
        assignmentsReceived: requesterNewAssignments.length,
        assignmentsGiven: acceptorNewAssignments.length
      }
    });

    // Notify acceptor
    await UserNotificationService.createNotification({
      userId,
      type: "SWAP_COMPLETED",
      title: swapRequest.scope === 'week' ? "✅ Week Swap Completed" : "✅ Day Swap Completed",
      message: swapRequest.scope === 'week'
        ? `You have swapped the entire week with ${requesterDetails?.fullName || "another user"}! You now have ${acceptorNewAssignments.length} tasks for week ${currentWeek}.`
        : `You have accepted the day swap for ${swapRequest.selectedDay} from ${requesterDetails?.fullName}.`,
      data: {
        swapRequestId: requestId,
        taskId: task.id,
        taskTitle: task.title,
        groupId: task.groupId,
        groupName: task.group?.name || 'Group',
        requesterId: swapRequest.requestedBy,
        requesterName: requesterDetails?.fullName,
        scope: swapRequest.scope,
        selectedDay: swapRequest.selectedDay,
        transferredCount,
        assignmentsReceived: acceptorNewAssignments.length,
        assignmentsGiven: requesterNewAssignments.length
      }
    });

    // 🔴 EMIT SOCKET EVENT
    await SocketService.emitSwapResponded(
      requestId,
      assignment.id,
      task.id,
      task.title,
      swapRequest.requestedBy,
      userId,
      acceptorDetails?.fullName || 'User',
      task.groupId,
      'ACCEPTED',
      swapRequest.scope === 'day' ? 'day' : 'week',
      swapRequest.selectedDay || undefined
    );

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
        title: swapRequest.scope === 'week' ? "🔄 Week Swap Completed" : "🔄 Day Swap Completed",
        message: swapRequest.scope === 'week'
          ? `${requesterDetails?.fullName || "A user"} and ${acceptorDetails?.fullName || "another user"} have exchanged ALL tasks for week ${currentWeek}.`
          : `${requesterDetails?.fullName || "A user"} and ${acceptorDetails?.fullName || "another user"} have exchanged ${swapRequest.selectedDay}'s tasks.`,
        data: {
          swapRequestId: requestId,
          taskId: task.id,
          taskTitle: task.title,
          groupId: task.groupId,
          groupName: task.group?.name || 'Group',
          fromUserId: swapRequest.requestedBy,
          toUserId: userId,
          fromUserName: requesterDetails?.fullName,
          toUserName: acceptorDetails?.fullName,
          scope: swapRequest.scope,
          selectedDay: swapRequest.selectedDay,
          transferredCount
        }
      });
    }

    // Get updated swap request for response
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
      message: successMessage,
      swapRequest: {
        ...updatedSwapRequest,
        requester: requesterDetails,
        targetUser: acceptorDetails
      },
      previousAssignee: {
        id: assignment.userId,
        name: assignment.user?.fullName || 'Unknown'
      },
      newAssignee: {
        id: userId,
        name: acceptorDetails?.fullName
      },
      scope: swapRequest.scope,
      selectedDay: swapRequest.selectedDay,
      transferredCount,
      requesterNewAssignments,
      acceptorNewAssignments,
      requesterTaskCount: requesterNewAssignments.length,
      acceptorTaskCount: acceptorNewAssignments.length,
      notifications: {
        notifiedRequester: true,
        notifiedAcceptor: true,
        notifiedAdmins: admins.length
      }
    };

  } catch (error: any) {
    console.error("SwapRequestService.acceptSwapRequest error:", error);
    return { 
      success: false, 
      message: error.message || "Error accepting swap request" 
    };
  }
}


  // REJECT: Reject a swap request
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

      // Check if task exists
      if (!swapRequest.assignment?.task) {
        return { 
          success: false, 
          message: "The task associated with this swap request has been deleted" 
        };
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

  // CANCEL: Cancel a swap request (only by requester)
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

      // Check if task exists
      if (!swapRequest.assignment?.task) {
        return { 
          success: false, 
          message: "The task associated with this swap request has been deleted" 
        };
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

      // Filter out requests with null tasks
      const validExpiredRequests = expiredRequests.filter(r => r.assignment?.task !== null);

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
      for (const request of validExpiredRequests) {
        // Notify requester
        await UserNotificationService.createNotification({
          userId: request.requestedBy,
          type: "SWAP_EXPIRED",
          title: "⏰ Swap Request Expired",
          message: `Your swap request for "${request.assignment?.task?.title || 'task'}" has expired`,
          data: {
            swapRequestId: request.id,
            taskId: request.assignment?.taskId,
            taskTitle: request.assignment?.task?.title
          }
        });

        // Notify target user if exists
        if (request.targetUserId) {
          await UserNotificationService.createNotification({
            userId: request.targetUserId,
            type: "SWAP_EXPIRED",
            title: "⏰ Swap Request Expired",
            message: `A swap request for "${request.assignment?.task?.title || 'task'}" has expired`,
            data: {
              swapRequestId: request.id,
              taskId: request.assignment?.taskId,
              taskTitle: request.assignment?.task?.title
            }
          });
        }
      }

      console.log(`Expired ${result.count} old swap requests`);
      return { success: true, count: result.count, notifiedUsers: validExpiredRequests.length * 2 };

    } catch (error: any) {
      console.error("SwapRequestService.expireOldRequests error:", error);
      return { success: false, message: error.message };
    }
  }
} 