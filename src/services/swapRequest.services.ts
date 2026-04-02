// services/swapRequest.services.ts - COMPLETE FIXED VERSION

import prisma from "../prisma";
import { Prisma, PrismaClient } from '@prisma/client';
import { UserNotificationService } from "./user.notification.services";
import { SocketService } from "./socket.services";

// Define DayOfWeek enum locally
enum DayOfWeek {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY'
}

// Define types for better type safety
interface AssignmentWithTask {
  id: string;
  taskId: string | null;
  userId: string;
  dueDate: Date;
  points: number;
  completed: boolean | null;
  rotationWeek: number;
  assignmentDay: DayOfWeek | null;
  task: {
    id: string;
    title: string;
    points: number;
    executionFrequency: string;
    timeSlots: Array<{
      id: string;
      startTime: string;
      endTime: string;
      label: string | null;
    }>;
    group?: {
      id: string;
      name: string;
      currentRotationWeek: number;
      tasks?: Array<{ id: string; createdAt: Date }>;
      settings?: any;
    };
    groupId: string; // Add this for direct access
  };
  user?: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
  timeSlot?: {
    id: string;
    startTime: string;
    endTime: string;
    label: string | null;
  } | null;
}

interface SwapRequestWithAssignment {
  id: string;
  assignmentId: string;
  requestedBy: string;
  targetUserId: string | null;
  scope: string | null;
  selectedDay: string | null;
  selectedTimeSlotId: string | null;
  status: string;
  reason: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  requiresAdminApproval: boolean;
  adminApproved: boolean | null;
  autoApproved: boolean;
  adminApprovedBy: string | null;
  adminApprovedAt: Date | null;
  adminRejectionReason: string | null;
  acceptedBy: string | null;
  acceptedAt: Date | null;
  assignment: {
    id: string;
    userId: string;
    dueDate: Date;
    points: number;
    rotationWeek: number;
    assignmentDay: DayOfWeek | null;
    task: {
      id: string;
      title: string;
      points: number;
      executionFrequency: string;
      groupId: string;
      group?: {
        id: string;
        name: string;
        currentRotationWeek: number;
      };
      timeSlots: Array<{
        id: string;
        startTime: string;
        endTime: string;
        label: string | null;
      }>;
    } | null;
    timeSlot: {
      id: string;
      startTime: string;
      endTime: string;
      label: string | null;
    } | null;
    user: {
      id: string;
      fullName: string;
      avatarUrl: string | null;
    } | null;
  } | null;
}

export class SwapRequestService {
 
  // CREATE SWAP REQUEST
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
      }) as AssignmentWithTask | null;

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

      // Get group ID from task
      const groupId = assignment.task.group?.id || assignment.task.groupId;

      const membership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId: groupId,
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
      }

      // ========== WEEK SWAP VALIDATION ==========
      if (data.scope === 'week') {
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
      let requiresAdminApproval = true;
      let adminApproved: boolean | null = null;
      let autoApproved = false;

      if (data.targetUserId) {
        const targetMembership = await prisma.groupMember.findFirst({
          where: {
            userId: data.targetUserId,
            groupId: groupId,
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
        
        const groupSettings = assignment.task.group?.settings as any;
        if (groupSettings?.autoApproveTargetedSwaps === true) {
          requiresAdminApproval = false;
          adminApproved = true;
          autoApproved = true;
        }
      }

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

      let expiresAt = data.expiresAt;
      if (!expiresAt) {
        expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);
      }

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
          selectedTimeSlotId: data.selectedTimeSlotId,
          requiresAdminApproval,
          adminApproved,
          autoApproved
        }
      });

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

      let notifiedUsersCount = 0;
      
      if (requiresAdminApproval) {
        const admins = await prisma.groupMember.findMany({
          where: {
            groupId: groupId,
            groupRole: "ADMIN",
            isActive: true
          },
          select: { userId: true }
        });

        for (const admin of admins) {
          await UserNotificationService.createNotification({
            userId: admin.userId,
            type: "SWAP_PENDING_APPROVAL",
            title: "🔄 Swap Request Awaiting Approval",
            message: `${assignment.user?.fullName || "A user"} wants to swap "${assignment.task.title}" ${getSwapDescription()}. Please review.`,
            data: {
              swapRequestId: swapRequest.id,
              assignmentId,
              taskId: assignment.taskId,
              taskTitle: assignment.task.title,
              groupId: groupId,
              groupName: assignment.task.group?.name || 'Group',
              requesterId: userId,
              requesterName: assignment.user?.fullName || 'Unknown',
              scope: data.scope,
              selectedDay: data.selectedDay,
              selectedTimeSlotId: data.selectedTimeSlotId,
              reason: data.reason,
              expiresAt
            }
          });
        }
        notifiedUsersCount = admins.length;
        
        await UserNotificationService.createNotification({
          userId,
          type: "SWAP_PENDING_APPROVAL",
          title: "⏳ Swap Request Submitted",
          message: `Your swap request for "${assignment.task.title}" ${getSwapDescription()} has been submitted and is waiting for admin approval.`,
          data: {
            swapRequestId: swapRequest.id,
            requiresAdminApproval: true
          }
        });
        
      } else if (adminApproved === true && autoApproved) {
        if (data.targetUserId) {
          await UserNotificationService.createNotification({
            userId: data.targetUserId,
            type: "SWAP_READY_FOR_ACCEPTANCE",
            title: "🔄 Swap Request Ready",
            message: `${assignment.user?.fullName || "A user"} wants to swap "${assignment.task.title}" ${getSwapDescription()} with you.`,
            data: {
              swapRequestId: swapRequest.id,
              assignmentId,
              taskId: assignment.taskId,
              taskTitle: assignment.task.title,
              groupId: groupId,
              groupName: assignment.task.group?.name || 'Group',
              requesterId: userId,
              requesterName: assignment.user?.fullName || 'Unknown',
              scope: data.scope,
              selectedDay: data.selectedDay,
              selectedTimeSlotId: data.selectedTimeSlotId,
              expiresAt
            }
          });
          notifiedUsersCount = 1;
        } else {
          const activeMembers = await prisma.groupMember.findMany({
            where: {
              groupId: groupId,
              isActive: true,
              inRotation: true,
              userId: { not: userId }
            },
            select: { userId: true }
          });

          let eligibleMembers = activeMembers;
          
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
          }

          for (const member of eligibleMembers) {
            await UserNotificationService.createNotification({
              userId: member.userId,
              type: "SWAP_READY_FOR_ACCEPTANCE",
              title: "🔄 Swap Request Available",
              message: `${assignment.user?.fullName || "A user"} is looking to swap "${assignment.task.title}" ${getSwapDescription()}`,
              data: {
                swapRequestId: swapRequest.id,
                assignmentId,
                taskId: assignment.taskId,
                taskTitle: assignment.task.title,
                groupId: groupId,
                groupName: assignment.task.group?.name || 'Group',
                requesterId: userId,
                requesterName: assignment.user?.fullName || 'Unknown',
                scope: data.scope,
                selectedDay: data.selectedDay,
                selectedTimeSlotId: data.selectedTimeSlotId,
                expiresAt
              }
            });
          }
          notifiedUsersCount = eligibleMembers.length;
        }
      }

      if (requiresAdminApproval) {
        await SocketService.emitSwapPendingApproval(
          swapRequest.id,
          assignmentId,
          assignment.taskId || 'unknown-task',
          assignment.task.title,
          userId,
          assignment.user?.fullName || 'Unknown',
          groupId,
          data.scope || 'week',
          expiresAt,
          data.targetUserId,
          data.selectedDay,
          data.selectedTimeSlotId
        );
      } else {
        await SocketService.emitSwapRequested(
          swapRequest.id,
          assignmentId,
          assignment.taskId || 'unknown-task',
          assignment.task.title,
          userId,
          assignment.user?.fullName || 'Unknown',
          groupId,
          data.scope || 'week',
          expiresAt,
          data.targetUserId,
          data.selectedDay,
          data.selectedTimeSlotId,
          data.reason
        );
      }

      return {
        success: true,
        message: requiresAdminApproval 
          ? `Swap request submitted for admin approval!` 
          : `Swap request created successfully!`,
        swapRequest: {
          ...swapRequestWithDetails,
          requester,
          requiresAdminApproval,
          adminApproved
        },
        notifications: { notifiedUsers: notifiedUsersCount },
        requiresAdminApproval
      };

    } catch (error: any) {
      console.error("SwapRequestService.createSwapRequest error:", error);
      return { success: false, message: error.message || "Error creating swap request" };
    }
  }

  // GET: Pending swap requests for admin approval
  static async getPendingForAdminApproval(
    groupId: string,
    adminId: string,
    filters: { limit: number; offset: number }
  ) {
    try {
      const adminMembership = await prisma.groupMember.findFirst({
        where: {
          userId: adminId,
          groupId,
          groupRole: "ADMIN",
          isActive: true
        }
      });

      if (!adminMembership) {
        return { 
          success: false, 
          message: "Only group admins can view pending approvals" 
        };
      }

      const where: any = {
        status: "PENDING",
        requiresAdminApproval: true,
        adminApproved: null,
        assignment: {
          task: {
            groupId
          }
        }
      };

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

      const requestsWithDetails = await Promise.all(
        requests.map(async (request: any) => {
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
        message: "Pending admin approvals retrieved",
        requests: requestsWithDetails,
        total
      };

    } catch (error: any) {
      console.error("SwapRequestService.getPendingForAdminApproval error:", error);
      return { success: false, message: error.message || "Error retrieving pending approvals" };
    }
  }

  // ADMIN: Approve swap request
  static async adminApproveSwapRequest(requestId: string, adminId: string, notes?: string) {
    try {
      const swapRequest = await prisma.swapRequest.findUnique({
        where: { id: requestId },
        include: {
          assignment: {
            include: {
              task: {
                include: {
                  group: true
                }
              },
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
      }) as SwapRequestWithAssignment | null;

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

      if (swapRequest.adminApproved !== null) {
        return { success: false, message: "This swap request has already been reviewed" };
      }

      const groupId = swapRequest.assignment.task.groupId;

      const adminMembership = await prisma.groupMember.findFirst({
        where: {
          userId: adminId,
          groupId: groupId,
          groupRole: "ADMIN",
          isActive: true
        }
      });

      if (!adminMembership) {
        return { success: false, message: "Only group admins can approve swap requests" };
      }

      const adminDetails = await prisma.user.findUnique({
        where: { id: adminId },
        select: { fullName: true }
      });

      const updatedRequest = await prisma.swapRequest.update({
        where: { id: requestId },
        data: {
          adminApproved: true,
          adminApprovedBy: adminId,
          adminApprovedAt: new Date(),
          status: "PENDING"
        }
      });

      const getSwapDescription = () => {
        if (swapRequest.scope === 'day') {
          return `for ${swapRequest.selectedDay}`;
        }
        return 'for the entire week';
      };

      await UserNotificationService.createNotification({
        userId: swapRequest.requestedBy,
        type: "SWAP_ADMIN_APPROVED",
        title: "✅ Swap Request Approved",
        message: `Admin ${adminDetails?.fullName} has approved your swap request ${getSwapDescription()} for "${swapRequest.assignment.task.title}". You can now share it with members or wait for someone to accept.`,
        data: {
          swapRequestId: requestId,
          taskId: swapRequest.assignment.task.id,
          taskTitle: swapRequest.assignment.task.title,
          groupId: groupId,
          approvedBy: adminId,
          approvedByName: adminDetails?.fullName,
          notes
        }
      });

      if (swapRequest.targetUserId) {
        await UserNotificationService.createNotification({
          userId: swapRequest.targetUserId,
          type: "SWAP_READY_FOR_ACCEPTANCE",
          title: "🔄 Swap Request Ready",
          message: `${swapRequest.assignment.user?.fullName} wants to swap "${swapRequest.assignment.task.title}" ${getSwapDescription()}. Admin has approved. You can now accept it.`,
          data: {
            swapRequestId: requestId,
            taskId: swapRequest.assignment.task.id,
            taskTitle: swapRequest.assignment.task.title,
            groupId: groupId,
            requesterId: swapRequest.requestedBy,
            requesterName: swapRequest.assignment.user?.fullName
          }
        });
      } else {
        const activeMembers = await prisma.groupMember.findMany({
          where: {
            groupId: groupId,
            isActive: true,
            inRotation: true,
            userId: { not: swapRequest.requestedBy }
          },
          select: { userId: true }
        });

        let eligibleMembers = activeMembers;
        
        if (swapRequest.scope === 'day' && swapRequest.selectedDay) {
          const eligibleList = [];
          for (const member of activeMembers) {
            const existingAssignment = await prisma.assignment.findFirst({
              where: {
                userId: member.userId,
                taskId: swapRequest.assignment.task.id,
                rotationWeek: swapRequest.assignment.rotationWeek,
                assignmentDay: swapRequest.selectedDay as DayOfWeek
              }
            });
            if (!existingAssignment) {
              eligibleList.push(member);
            }
          }
          eligibleMembers = eligibleList;
        }

        for (const member of eligibleMembers) {
          await UserNotificationService.createNotification({
            userId: member.userId,
            type: "SWAP_READY_FOR_ACCEPTANCE",
            title: "🔄 Swap Request Available",
            message: `${swapRequest.assignment.user?.fullName} wants to swap "${swapRequest.assignment.task.title}" ${getSwapDescription()}. Admin approved.`,
            data: {
              swapRequestId: requestId,
              taskId: swapRequest.assignment.task.id,
              taskTitle: swapRequest.assignment.task.title,
              groupId: groupId,
              requesterId: swapRequest.requestedBy,
              requesterName: swapRequest.assignment.user?.fullName,
              scope: swapRequest.scope,
              selectedDay: swapRequest.selectedDay
            }
          });
        }
      }

      await SocketService.emitSwapAdminAction(
        requestId,
        swapRequest.assignmentId,
        swapRequest.assignment.task.id,
        swapRequest.assignment.task.title,
        swapRequest.requestedBy,
        adminId,
        adminDetails?.fullName || 'Admin',
        groupId,
        'APPROVED'
      );

      return {
        success: true,
        message: "Swap request approved by admin. Waiting for member to accept.",
        swapRequest: updatedRequest,
        notifications: {
          notifiedRequester: true,
          notifiedTarget: !!swapRequest.targetUserId
        }
      };

    } catch (error: any) {
      console.error("SwapRequestService.adminApproveSwapRequest error:", error);
      return { success: false, message: error.message || "Error approving swap request" };
    }
  }

  // ADMIN: Reject swap request
  static async adminRejectSwapRequest(requestId: string, adminId: string, reason: string) {
    try {
      const swapRequest = await prisma.swapRequest.findUnique({
        where: { id: requestId },
        include: {
          assignment: {
            include: {
              task: {
                include: {
                  group: true
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
      }) as SwapRequestWithAssignment | null;

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

      if (swapRequest.adminApproved !== null) {
        return { success: false, message: "This swap request has already been reviewed" };
      }

      const groupId = swapRequest.assignment.task.groupId;

      const adminMembership = await prisma.groupMember.findFirst({
        where: {
          userId: adminId,
          groupId: groupId,
          groupRole: "ADMIN",
          isActive: true
        }
      });

      if (!adminMembership) {
        return { success: false, message: "Only group admins can reject swap requests" };
      }

      const adminDetails = await prisma.user.findUnique({
        where: { id: adminId },
        select: { fullName: true }
      });

      const updatedRequest = await prisma.swapRequest.update({
        where: { id: requestId },
        data: {
          adminApproved: false,
          adminApprovedBy: adminId,
          adminApprovedAt: new Date(),
          adminRejectionReason: reason,
          status: "REJECTED"
        }
      });

      const getSwapDescription = () => {
        if (swapRequest.scope === 'day') {
          return `for ${swapRequest.selectedDay}`;
        }
        return 'for the entire week';
      };

      await UserNotificationService.createNotification({
        userId: swapRequest.requestedBy,
        type: "SWAP_ADMIN_REJECTED",
        title: "❌ Swap Request Rejected",
        message: `Admin ${adminDetails?.fullName} rejected your swap request ${getSwapDescription()} for "${swapRequest.assignment.task.title}". Reason: ${reason}`,
        data: {
          swapRequestId: requestId,
          taskId: swapRequest.assignment.task.id,
          taskTitle: swapRequest.assignment.task.title,
          groupId: groupId,
          rejectedBy: adminId,
          rejectedByName: adminDetails?.fullName,
          reason
        }
      });

      if (swapRequest.targetUserId) {
        await UserNotificationService.createNotification({
          userId: swapRequest.targetUserId,
          type: "SWAP_ADMIN_REJECTED",
          title: "❌ Swap Request Rejected",
          message: `Admin rejected a swap request that was meant for you.`,
          data: {
            swapRequestId: requestId,
            taskId: swapRequest.assignment.task.id,
            taskTitle: swapRequest.assignment.task.title,
            groupId: groupId
          }
        });
      }

      await SocketService.emitSwapAdminAction(
        requestId,
        swapRequest.assignmentId,
        swapRequest.assignment.task.id,
        swapRequest.assignment.task.title,
        swapRequest.requestedBy,
        adminId,
        adminDetails?.fullName || 'Admin',
        groupId,
        'REJECTED',
        reason
      );

      return {
        success: true,
        message: "Swap request rejected by admin",
        swapRequest: updatedRequest,
        notifications: {
          notifiedRequester: true,
          notifiedTarget: !!swapRequest.targetUserId
        }
      };

    } catch (error: any) {
      console.error("SwapRequestService.adminRejectSwapRequest error:", error);
      return { success: false, message: error.message || "Error rejecting swap request" };
    }
  }

  // ACCEPT SWAP REQUEST
  static async acceptSwapRequest(requestId: string, userId: string) {
    try {
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
      }) as SwapRequestWithAssignment | null;

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

      if (swapRequest.requiresAdminApproval && swapRequest.adminApproved !== true) {
        return { 
          success: false, 
          message: "This swap request is waiting for admin approval. Please wait for an admin to approve it before accepting." 
        };
      }

      if (swapRequest.targetUserId && swapRequest.targetUserId !== userId) {
        return { success: false, message: "This swap request was sent to a specific user" };
      }

      const groupId = swapRequest.assignment.task.groupId;

      const membership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId: groupId,
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
      const currentWeek = task.group?.currentRotationWeek || 0;
      const requesterId = swapRequest.requestedBy;

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
        console.log(`🔄 Processing DAY swap for ${swapRequest.selectedDay}`);
        
        const transactionResult = await prisma.$transaction(async (prisma:any) => {
          const updated = await prisma.swapRequest.update({
            where: { id: requestId },
            data: { 
              status: "ACCEPTED", 
              targetUserId: userId, 
              acceptedBy: userId, 
              acceptedAt: new Date() 
            }
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
        
        await SocketService.emitAssignmentUpdated(
          transactionResult.requesterAssignment.id,
          requesterId,
          groupId
        );
        
        if (transactionResult.acceptorAssignment) {
          await SocketService.emitAssignmentUpdated(
            transactionResult.acceptorAssignment.id,
            userId,
            groupId
          );
        } else {
          await SocketService.emitAssignmentUpdated(
            transactionResult.requesterAssignment.id,
            userId,
            groupId
          );
        }

      } else {
        console.log(`🔄 Processing WEEK swap - EXCHANGING all tasks between users`);

        const transactionResult = await prisma.$transaction(async (prisma:any) => {
          const updated = await prisma.swapRequest.update({
            where: { id: requestId },
            data: { 
              status: "ACCEPTED", 
              targetUserId: userId, 
              acceptedBy: userId, 
              acceptedAt: new Date() 
            }
          });

          const requesterAssignments = await prisma.assignment.findMany({
            where: {
              taskId: task.id,
              userId: requesterId,
              rotationWeek: currentWeek
            }
          });

          const acceptorAssignments = await prisma.assignment.findMany({
            where: {
              taskId: task.id,
              userId: userId,
              rotationWeek: currentWeek
            }
          });

          if (requesterAssignments.length === 0) {
            throw new Error("No assignments found for requester this week");
          }

          const updatedRequesterAssignments: any[] = [];
          const updatedAcceptorAssignments: any[] = [];

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

          await prisma.task.update({
            where: { id: task.id },
            data: {
              currentAssignee: userId,
              lastAssignedAt: new Date()
            }
          });

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

        for (const assignment of transactionResult.requesterAssignments) {
          await SocketService.emitAssignmentUpdated(
            assignment.id,
            requesterId,
            groupId
          );
        }
        
        for (const assignment of transactionResult.acceptorAssignments) {
          await SocketService.emitAssignmentUpdated(
            assignment.id,
            userId,
            groupId
          );
        }
      }

      let successMessage = "";
      if (swapRequest.scope === 'day') {
        if (transferredCount === 2) {
          successMessage = `Swap completed! You and ${requesterDetails?.fullName} have exchanged ${swapRequest.selectedDay}'s assignments.`;
        } else {
          successMessage = `Swap completed! You've taken over ${swapRequest.selectedDay}'s assignment from ${requesterDetails?.fullName}.`;
        }
      } else {
        successMessage = `Week swap completed! You and ${requesterDetails?.fullName} have exchanged ALL tasks for week ${currentWeek}.`;
      }

      await UserNotificationService.createNotification({
        userId: swapRequest.requestedBy,
        type: "SWAP_ACCEPTED",
        title: swapRequest.scope === 'week' ? "✅ Week Swap Completed" : "✅ Day Swap Completed",
        message: successMessage,
        data: {
          swapRequestId: requestId,
          taskId: task.id,
          taskTitle: task.title,
          groupId: groupId,
          acceptorId: userId,
          acceptorName: acceptorDetails?.fullName,
          scope: swapRequest.scope,
          selectedDay: swapRequest.selectedDay
        }
      });

      await UserNotificationService.createNotification({
        userId,
        type: "SWAP_COMPLETED",
        title: swapRequest.scope === 'week' ? "✅ Week Swap Completed" : "✅ Day Swap Completed",
        message: successMessage,
        data: {
          swapRequestId: requestId,
          taskId: task.id,
          taskTitle: task.title,
          groupId: groupId,
          requesterId: swapRequest.requestedBy,
          requesterName: requesterDetails?.fullName,
          scope: swapRequest.scope,
          selectedDay: swapRequest.selectedDay
        }
      });

      await SocketService.emitSwapResponded(
        requestId,
        assignment.id,
        task.id,
        task.title,
        swapRequest.requestedBy,
        userId,
        acceptorDetails?.fullName || 'User',
        groupId,
        'ACCEPTED',
        swapRequest.scope === 'day' ? 'day' : 'week',
        swapRequest.selectedDay || undefined
      );

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
          notifiedAcceptor: true
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

      const validRequests = requests.filter((r:any) => r.assignment?.task !== null);

      const requestsWithDetails = await Promise.all(
        validRequests.map(async (request: any) => {
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
            selectedTimeSlot,
            requiresAdminApproval: request.requiresAdminApproval,
            adminApproved: request.adminApproved,
            autoApproved: request.autoApproved
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

  // GET: Get pending swap requests for a user
  static async getPendingSwapRequestsForUser(
    userId: string,
    filters: {
      groupId?: string;
      limit: number;
      offset: number;
    }
  ) {
    try {
      if (filters.groupId) {
        const userMembership = await prisma.groupMember.findFirst({
          where: {
            userId,
            groupId: filters.groupId,
            isActive: true
          }
        });

        if (userMembership && !userMembership.inRotation) {
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

      const where: any = {
        status: "PENDING",
        requestedBy: { not: userId },
        OR: [
          { targetUserId: null },
          { targetUserId: userId }
        ]
      };
 
      where.adminApproved = {
        not: false
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

      const validRequests = requests.filter((r:any)=> r.assignment?.task !== null);

      const requestsWithDetails = await Promise.all(
        validRequests.map(async (request: any) => {
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
            selectedTimeSlot,
            requiresAdminApproval: request.requiresAdminApproval,
            adminApproved: request.adminApproved
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

  // GET: Get group swap requests (admin view)
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

      const validRequests = requests.filter((r:any) => r.assignment?.task !== null);
      
      const requestsWithDetails = await Promise.all(
        validRequests.map(async (request: any) => {
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
            selectedTimeSlot,
            requiresAdminApproval: request.requiresAdminApproval,
            adminApproved: request.adminApproved,
            adminApprovedBy: request.adminApprovedBy,
            adminApprovedAt: request.adminApprovedAt,
            adminRejectionReason: request.adminRejectionReason,
            autoApproved: request.autoApproved,
            acceptedBy: request.acceptedBy,
            acceptedAt: request.acceptedAt
          };
        })
      );

      return {
        success: true,
        message: "Group swap requests retrieved successfully",
        requests: requestsWithDetails,
        total: validRequests.length,
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
      }) as SwapRequestWithAssignment | null;

      if (!swapRequest) {
        return { success: false, message: "Swap request not found" };
      }

      if (!swapRequest.assignment?.task) {
        return { 
          success: false, 
          message: "The task associated with this swap request has been deleted" 
        };
      }

      if (swapRequest.status === 'PENDING' && 
          swapRequest.expiresAt && 
          swapRequest.expiresAt < new Date()) {
        
        await prisma.swapRequest.update({
          where: { id: requestId },
          data: { status: "EXPIRED" }
        });
        
        swapRequest.status = "EXPIRED";
      }

      const requester = await prisma.user.findUnique({
        where: { id: swapRequest.requestedBy },
        select: {
          id: true,
          fullName: true,
          avatarUrl: true
        }
      });

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
        selectedTimeSlot,
        requiresAdminApproval: swapRequest.requiresAdminApproval,
        adminApproved: swapRequest.adminApproved,
        adminApprovedBy: swapRequest.adminApprovedBy,
        adminApprovedAt: swapRequest.adminApprovedAt,
        adminRejectionReason: swapRequest.adminRejectionReason,
        autoApproved: swapRequest.autoApproved,
        acceptedBy: swapRequest.acceptedBy,
        acceptedAt: swapRequest.acceptedAt
      };

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

  // REJECT: Reject a swap request
  static async rejectSwapRequest(requestId: string, userId: string, reason?: string) {
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

      if (!swapRequest.assignment?.task) {
        return { 
          success: false, 
          message: "The task associated with this swap request has been deleted" 
        };
      }

      if (swapRequest.status !== "PENDING") {
        return { success: false, message: `This swap request is already ${swapRequest.status.toLowerCase()}` };
      }

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

      const userDetails = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true, avatarUrl: true }
      });

      const updatedRequest = await prisma.swapRequest.update({
        where: { id: requestId },
        data: { 
          status: "REJECTED",
          reason: reason || undefined
        }
      });

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

  // CANCEL: Cancel a swap request
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

      if (!swapRequest.assignment?.task) {
        return { 
          success: false, 
          message: "The task associated with this swap request has been deleted" 
        };
      }

      if (swapRequest.requestedBy !== userId) {
        return { success: false, message: "Only the requester can cancel this swap request" };
      }

      if (swapRequest.status !== "PENDING") {
        return { success: false, message: `Cannot cancel a ${swapRequest.status.toLowerCase()} swap request` };
      }

      const requesterDetails = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true }
      });

      const updatedRequest = await prisma.swapRequest.update({
        where: { id: requestId },
        data: { status: "CANCELLED" }
      });

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

      const validExpiredRequests = expiredRequests.filter((r:any) => r.assignment?.task !== null);

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

      for (const request of validExpiredRequests) {
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