// controllers/swapRequest.controller.ts - COMPLETE WITH ADMIN APPROVAL

import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { SwapRequestService } from "../services/swapRequest.services";
import { DayOfWeek } from "@prisma/client";
import prisma from "../prisma";


export class SwapRequestController {
  
  // CREATE: Request to swap an assignment
  static async createSwapRequest(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { 
        assignmentId,  
        reason, 
        targetUserId, 
        expiresAt,
        scope,
        selectedDay, 
        selectedTimeSlotId
      } = req.body;

      if (!userId) { 
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!assignmentId) {
        return res.status(400).json({
          success: false,
          message: "Assignment ID is required"
        });
      }

      const result = await SwapRequestService.createSwapRequest(
        userId,
        assignmentId,
        {
          reason,
          targetUserId,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          scope,
          selectedDay,
          selectedTimeSlotId
        }
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }
 
      return res.status(201).json({
        success: true,
        message: result.message, 
        data: result.swapRequest,
        notifications: result.notifications,
        requiresAdminApproval: result.requiresAdminApproval
      });

    } catch (error: any) {
      console.error("SwapRequestController.createSwapRequest error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // GET: Pending swap requests for admin approval
  static async getPendingForAdminApproval(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as {groupId:string};
      const { limit = 50, offset = 0 } = req.query;

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

      const result = await SwapRequestService.getPendingForAdminApproval(
        groupId,
        userId,
        {
          limit: Number(limit),
          offset: Number(offset)
        }
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error: any) {
      console.error("SwapRequestController.getPendingForAdminApproval error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // POST: Admin approve swap request
  static async adminApproveSwapRequest(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { requestId } = req.params as {requestId:string};
      const { notes } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!requestId) {
        return res.status(400).json({
          success: false,
          message: "Request ID is required"
        });
      }

      const result = await SwapRequestService.adminApproveSwapRequest(
        requestId,
        userId,
        notes
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error: any) {
      console.error("SwapRequestController.adminApproveSwapRequest error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // POST: Admin reject swap request
  static async adminRejectSwapRequest(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { requestId } = req.params as {requestId:string};
      const { reason } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!requestId) {
        return res.status(400).json({
          success: false,
          message: "Request ID is required"
        });
      }

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: "Rejection reason is required"
        });
      }

      const result = await SwapRequestService.adminRejectSwapRequest(
        requestId,
        userId,
        reason
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      return res.json(result);
    } catch (error: any) {
      console.error("SwapRequestController.adminRejectSwapRequest error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // GET: Get swap requests created by current user
  static async getMySwapRequests(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { 
        status, 
        groupId,
        limit = 20, 
        offset = 0 
      } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const result = await SwapRequestService.getUserSwapRequests(
        userId,
        {
          status: status as string,
          groupId: groupId as string,
          limit: Number(limit),
          offset: Number(offset)
        }
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
        data: {
          requests: result.requests,
          total: result.total
        }
      });

    } catch (error: any) {
      console.error("SwapRequestController.getMySwapRequests error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // GET: Get pending swap requests for current user (to accept/reject)
  static async getPendingForMe(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { 
        groupId,
        limit = 20, 
        offset = 0 
      } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const result = await SwapRequestService.getPendingSwapRequestsForUser(
        userId,
        {
          groupId: groupId as string,
          limit: Number(limit),
          offset: Number(offset)
        }
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
        data: {
          requests: result.requests,
          total: result.total
        }
      });

    } catch (error: any) {
      console.error("SwapRequestController.getPendingForMe error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // GET: Get group swap requests (for admin history view)
  static async getGroupSwapRequests(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as {groupId:string};
      const { 
        status,
        limit = 50, 
        offset = 0 
      } = req.query;

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

      const result = await SwapRequestService.getGroupSwapRequests(
        groupId,
        userId,
        {
          status: status as string,
          limit: Number(limit),
          offset: Number(offset)
        }
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
        data: {
          requests: result.requests,
          total: result.total,
          stats: result.stats
        }
      });

    } catch (error: any) {
      console.error("SwapRequestController.getGroupSwapRequests error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // GET: Get single swap request details
  static async getSwapRequestDetails(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { requestId } = req.params as {requestId:string};

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!requestId) {
        return res.status(400).json({
          success: false,
          message: "Request ID is required"
        });
      }

      const result = await SwapRequestService.getSwapRequestDetails(
        requestId,
        userId
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
        data: result.swapRequest
      });

    } catch (error: any) {
      console.error("SwapRequestController.getSwapRequestDetails error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ACCEPT: Accept a swap request
  static async acceptSwapRequest(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { requestId } = req.params as {requestId:string};

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!requestId) {
        return res.status(400).json({
          success: false,
          message: "Request ID is required"
        });
      }

      const result = await SwapRequestService.acceptSwapRequest(
        requestId,
        userId
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      const responseData: any = {
        swapRequest: result.swapRequest,
        previousAssignee: result.previousAssignee,
        scope: result.scope,
        selectedDay: result.selectedDay,
        transferredCount: result.transferredCount,
        notifications: result.notifications
      };

      if (result.newAssignee) {
        responseData.newAssignee = result.newAssignee;
      }

      if (result.scope === 'week') {
        if ('requesterNewAssignments' in result) {
          responseData.requesterNewAssignments = result.requesterNewAssignments;
          responseData.acceptorNewAssignments = result.acceptorNewAssignments;
          responseData.requesterReceivedCount = result.requesterNewAssignments?.length || 0;
          responseData.acceptorReceivedCount = result.acceptorNewAssignments?.length || 0;
        }
      }

      if (result.scope === 'day') {
        if ('newAssignments' in result) {
          responseData.newAssignments = result.newAssignments;
        }
      }

      return res.json({
        success: true,
        message: result.message,
        data: responseData
      });

    } catch (error: any) {
      console.error("SwapRequestController.acceptSwapRequest error:", error);
      return res.status(500).json({
        success: false, 
        message: "Internal server error"
      });
    }
  }

  // REJECT: Reject a swap request
  static async rejectSwapRequest(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id; 
      const { requestId } = req.params as {requestId:string};
      const { reason } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!requestId) {
        return res.status(400).json({
          success: false,
          message: "Request ID is required"
        });
      }

      const result = await SwapRequestService.rejectSwapRequest(
        requestId,
        userId,
        reason
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
        data: result.swapRequest,
        notifications: result.notifications
      });

    } catch (error: any) {
      console.error("SwapRequestController.rejectSwapRequest error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // CANCEL: Cancel a swap request
  static async cancelSwapRequest(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { requestId } = req.params as {requestId:string};

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!requestId) {
        return res.status(400).json({
          success: false,
          message: "Request ID is required"
        });
      }

      const result = await SwapRequestService.cancelSwapRequest(
        requestId,
        userId
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
        data: result.swapRequest,
        notifications: result.notifications
      });

    } catch (error: any) {
      console.error("SwapRequestController.cancelSwapRequest error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
  
  // CHECK: Check if assignment can be swapped
  static async checkCanSwap(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as {assignmentId:string};
      const { scope, selectedDay, selectedTimeSlotId } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

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
          timeSlot: true
        }
      });

      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: "Assignment not found"
        });
      }

      if (!assignment.task) {
        return res.json({
          success: true,
          canSwap: false,
          reason: "The task associated with this assignment has been deleted"
        });
      }

      if (assignment.userId !== userId) {
        return res.json({
          success: true,
          canSwap: false,
          reason: "You can only request swap for your own assignments"
        });
      }

      if (assignment.completed) {
        return res.json({
          success: true,
          canSwap: false,
          reason: "Cannot swap completed assignments"
        });
      }

      const existingRequest = await prisma.swapRequest.findFirst({
        where: {
          assignmentId,
          status: "PENDING"
        }
      });

      if (existingRequest) {
        return res.json({
          success: true,
          canSwap: false,
          reason: "A pending swap request already exists for this assignment",
          existingRequestId: existingRequest.id
        });
      }

      const now = new Date();

      // ===== WEEK SWAP =====
      if (scope === 'week') {
        const firstTask = assignment.task.group?.tasks?.[0];
        if (!firstTask) {
          return res.json({
            success: true,
            canSwap: false,
            reason: "Cannot determine week start date - no tasks found"
          });
        }

        const firstTaskDate = new Date(firstTask.createdAt);
        const firstTaskDay = firstTaskDate.getDay();
        const today = now.getDay();
        let daysSinceWeekStart = today - firstTaskDay;
        if (daysSinceWeekStart < 0) daysSinceWeekStart += 7;
        
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - daysSinceWeekStart);
        weekStart.setHours(0, 0, 0, 0);
        
        const hoursSinceWeekStart = (now.getTime() - weekStart.getTime()) / (1000 * 60 * 60);
        const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        
        if (hoursSinceWeekStart > 24) {
          return res.json({
            success: true,
            canSwap: false,
            reason: `Week swap window has closed (only available within first 24 hours of the week, which started on ${weekDayNames[firstTaskDay]})`
          });
        }
        
        return res.json({
          success: true,
          canSwap: true,
          weekInfo: {
            weekNumber: Math.floor(
              (now.getTime() - firstTaskDate.getTime()) / (1000 * 60 * 60 * 24) / 7
            ) + 1,
            weekStart: weekStart.toISOString(),
            weekStartDay: weekDayNames[firstTaskDay],
            hoursLeft: Math.max(0, 24 - hoursSinceWeekStart)
          }
        });
      }

      // ===== DAY SWAP =====
      if (scope === 'day') {
        const dueDate = new Date(assignment.dueDate);
        const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        
        let targetDay = selectedDay as string;
        let targetDate: Date | null = null;
        
        if (targetDay) {
          const targetDayIndex = dayNames.indexOf(targetDay);
          if (targetDayIndex === -1) {
            return res.json({
              success: true,
              canSwap: false,
              reason: "Invalid day selected"
            });
          }
          
          targetDate = new Date(now);
          let daysToAdd = targetDayIndex - now.getDay();
          if (daysToAdd < 0) daysToAdd += 7;
          targetDate.setDate(now.getDate() + daysToAdd);
          targetDate.setHours(0, 0, 0, 0);
        }
        
        if (now > dueDate) {
          return res.json({
            success: true,
            canSwap: false,
            reason: "Cannot swap assignments that are already past due"
          });
        }
        
        if (assignment.task.executionFrequency === 'WEEKLY' && targetDay) {
          let taskDays: string[] = [];
          if (assignment.task.selectedDays) {
            try {
              taskDays = JSON.parse(assignment.task.selectedDays as string);
            } catch {
              taskDays = [];
            }
          }
          
          if (taskDays.length > 0 && !taskDays.includes(targetDay)) {
            return res.json({
              success: true,
              canSwap: false,
              reason: `This task is not scheduled on ${targetDay}. Available days: ${taskDays.join(', ')}`
            });
          }
        }
        
        if (targetDay && targetDate && targetDate.toDateString() === dueDate.toDateString()) {
          if (assignment.timeSlot && assignment.timeSlot.endTime) {
            const timeParts = assignment.timeSlot.endTime.split(':');
            const endHour = parseInt(timeParts[0] || '0', 10);
            const endMinute = parseInt(timeParts[1] || '0', 10);
            
            if (!isNaN(endHour) && !isNaN(endMinute)) {
              const endTime = new Date(dueDate);
              endTime.setHours(endHour, endMinute, 0, 0);
              
              if (now > endTime) {
                return res.json({
                  success: true,
                  canSwap: false,
                  reason: "Cannot swap after the task's end time for today"
                });
              }
            }
          }
        }
        
        return res.json({
          success: true,
          canSwap: true,
          dayInfo: targetDate ? {
            day: targetDay,
            date: targetDate.toISOString(),
            isToday: targetDate.toDateString() === now.toDateString()
          } : undefined
        });
      }

      return res.json({
        success: true,
        canSwap: true
      });

    } catch (error: any) {
      console.error("SwapRequestController.checkCanSwap error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // CHECK: Check if a user has an assignment on a specific day
  static async checkUserHasAssignmentOnDay(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { targetUserId, groupId, day, week } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!targetUserId || !groupId || !day || !week) {
        return res.status(400).json({
          success: false,
          message: "Missing required parameters: targetUserId, groupId, day, week"
        });
      }

      console.log(`🔍 Checking if user ${targetUserId} has assignment on ${day} (week ${week}) in group ${groupId}`);

      const assignment = await prisma.assignment.findFirst({
        where: {
          userId: targetUserId as string,
          task: {
            groupId: groupId as string
          },
          rotationWeek: parseInt(week as string, 10),
          assignmentDay: day as any
        },
        include: {
          task: {
            select: {
              id: true,
              title: true
            }
          }
        }
      });

      console.log(`📋 Result: ${assignment ? `Found assignment for ${assignment.task?.title}` : 'No assignment found'}`);

      return res.json({
        success: true,
        hasAssignment: !!assignment,
        assignment: assignment ? {
          id: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task?.title,
          dueDate: assignment.dueDate
        } : null
      });

    } catch (error: any) {
      console.error("SwapRequestController.checkUserHasAssignmentOnDay error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        hasAssignment: false
      });
    }
  }


// CHECK: Check if a user has any assignments this week (for WEEK swap exchange)
static async checkUserHasAnyAssignmentThisWeek(req: UserAuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { targetUserId, groupId, week } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    if (!targetUserId || !groupId || !week) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters: targetUserId, groupId, week"
      });
    }

    console.log(`🔍 [WEEK SWAP CHECK] Checking if user ${targetUserId} has ANY assignments in week ${week} in group ${groupId}`);

    const assignments = await prisma.assignment.findMany({
      where: {
        userId: targetUserId as string,
        task: {
          groupId: groupId as string
        },
        rotationWeek: parseInt(week as string, 10)
      },
      select: {  
        id: true,
        dueDate: true,
        assignmentDay: true,
        points: true,
        task: {
          select: {
            id: true,
            title: true,
            points: true
          }
        }
      }
    });

    console.log(`📋 Result: ${assignments.length > 0 ? `YES - ${assignments.length} assignments found` : 'NO - no assignments'}`);

    return res.json({
      success: true,
      hasAssignment: assignments.length > 0,
      assignmentCount: assignments.length,
      assignments: assignments
    });

  } catch (error: any) {
    console.error("SwapRequestController.checkUserHasAnyAssignmentThisWeek error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      hasAssignment: false
    });
  }
}

// controllers/swapRequest.controller.ts - ADD THESE BATCH METHODS WITH FULL CONSOLE LOGS

// BATCH: Check multiple users' assignments on a specific day
static async batchCheckUserAssignments(req: UserAuthRequest, res: Response) {
  console.log('🚀🚀🚀 [BATCH DAY] STARTING batchCheckUserAssignments 🚀🚀🚀');
  
  try {
    const userId = req.user?.id;
    const { userIds, groupId, day, week } = req.body || {};

    console.log('📦 [BATCH DAY] Request body:', JSON.stringify({ userIds, groupId, day, week }, null, 2));
    console.log('📦 [BATCH DAY] userId from token:', userId);
    console.log('📦 [BATCH DAY] userIds length:', userIds?.length);

    if (!userId) {
      console.log('❌ [BATCH DAY] No user ID in token');
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.log('❌ [BATCH DAY] Invalid userIds array');
      return res.status(400).json({ success: false, message: "userIds array is required" });
    }

    if (!groupId || !day || !week) {
      console.log('❌ [BATCH DAY] Missing parameters:', { groupId, day, week });
      return res.status(400).json({ success: false, message: "Missing required parameters: groupId, day, week" });
    }

    console.log(`🔍 [BATCH DAY] Batch checking ${userIds.length} users for day ${day} (week ${week})`);

    const results = [];
    const weekNum = parseInt(week as string, 10);
    console.log(`📅 [BATCH DAY] Parsed week number: ${weekNum}`);

    for (let i = 0; i < userIds.length; i++) {
      const targetUserId = userIds[i];
      console.log(`\n--- [BATCH DAY] Processing user ${i + 1}/${userIds.length}: ${targetUserId} ---`);
      
      try {
        // Check if user has ANY assignment this week
        console.log(`🔍 [BATCH DAY] Checking ANY assignment for user ${targetUserId}, week ${weekNum}, group ${groupId}`);
        
        const anyAssignment = await prisma.assignment.findFirst({
          where: {
            userId: targetUserId,
            task: { groupId },
            rotationWeek: weekNum
          }
        });
        
        console.log(`📊 [BATCH DAY] anyAssignment result: ${anyAssignment ? `FOUND (id: ${anyAssignment.id})` : 'NOT FOUND'}`);

        // Check if user has assignment on specific day
        const dayValue = day.toUpperCase() as any;
        console.log(`🔍 [BATCH DAY] Checking DAY assignment for user ${targetUserId}, day ${dayValue}, week ${weekNum}`);
        
        const dayAssignment = await prisma.assignment.findFirst({
          where: {
            userId: targetUserId,
            task: { groupId },
            rotationWeek: weekNum,
            assignmentDay: dayValue
          }
        });
        
        console.log(`📊 [BATCH DAY] dayAssignment result: ${dayAssignment ? `FOUND (id: ${dayAssignment.id})` : 'NOT FOUND'}`);

        results.push({
          userId: targetUserId,
          hasAnyAssignmentThisWeek: !!anyAssignment,
          hasAssignmentOnDay: !!dayAssignment
        });
        
        console.log(`✅ [BATCH DAY] Result for ${targetUserId}: hasAny=${!!anyAssignment}, hasDay=${!!dayAssignment}`);
        
      } catch (err) {
        console.error(`❌ [BATCH DAY] Error checking user ${targetUserId}:`, err);
        results.push({
          userId: targetUserId,
          hasAnyAssignmentThisWeek: false,
          hasAssignmentOnDay: false
        });
      }
    }

    console.log(`\n✅ [BATCH DAY] Batch check complete:`);
    console.log(`   Total users: ${results.length}`);
    console.log(`   Have ANY assignments: ${results.filter(r => r.hasAnyAssignmentThisWeek).length}`);
    console.log(`   Have DAY assignments: ${results.filter(r => r.hasAssignmentOnDay).length}`);
    console.log(`📊 [BATCH DAY] Full results:`, JSON.stringify(results, null, 2));

    return res.json({
      success: true,
      results
    });

  } catch (error: any) {
    console.error('💥💥💥 [BATCH DAY] CATASTROPHIC ERROR 💥💥💥');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Internal server error",
      error: error.toString(),
      stack: error.stack
    });
  }
}

// BATCH: Check multiple users' week assignments
// controllers/swapRequest.controller.ts - DEBUG VERSION

static async batchCheckUserWeekAssignments(req: UserAuthRequest, res: Response) {
  console.log('🚀🚀🚀 [BATCH WEEK] STARTING batchCheckUserWeekAssignments 🚀🚀🚀');
  
  // 🔍 DEBUG: Log everything about the request
  console.log('🔍 req.method:', req.method);
  console.log('🔍 req.url:', req.url);
  console.log('🔍 req.headers["content-type"]:', req.headers['content-type']);
  console.log('🔍 req.headers["content-length"]:', req.headers['content-length']);
  console.log('🔍 req.body:', req.body);
  console.log('🔍 typeof req.body:', typeof req.body);
  console.log('🔍 req.body keys:', req.body ? Object.keys(req.body) : 'null/undefined');
  
  // 🔧 Try to get raw body if express.json failed
  let bodyData = req.body;
  
  if (!bodyData || Object.keys(bodyData).length === 0) {
    console.log('⚠️ req.body is empty, attempting to read raw body...');
    
    // Read raw body
    const rawBody = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        resolve(data);
      });
    });
    
    console.log('📦 Raw body received:', rawBody);
    
    if (rawBody) {
      try {
        bodyData = JSON.parse(rawBody);
        console.log('✅ Successfully parsed raw body:', bodyData);
      } catch (e) {
        console.error('❌ Failed to parse raw body:', e);
      }
    }
  }
  
  // Now try to get the parameters
  const { userIds, groupId, week } = bodyData || {};
  
  console.log('📦 Extracted params:', { userIds, groupId, week });
  
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.log('❌ Invalid userIds:', userIds);
      return res.status(400).json({ success: false, message: "userIds array is required" });
    }

    if (!groupId || !week) {
      console.log('❌ Missing parameters:', { groupId, week });
      return res.status(400).json({ success: false, message: "Missing required parameters: groupId, week" });
    }

    const weekNum = parseInt(week as string, 10);
    console.log(`📅 Parsed week number: ${weekNum}`);
    console.log(`🔍 Batch checking ${userIds.length} users for week ${weekNum}`);

    // Use Promise.all for parallel execution
    const results = await Promise.all(
      userIds.map(async (targetUserId) => {
        try {
          const assignments = await prisma.assignment.findMany({
            where: {
              userId: targetUserId,
              task: { groupId },
              rotationWeek: weekNum
            },
            select: {
              id: true,
              assignmentDay: true,
              points: true
            }
          });

          return {
            userId: targetUserId,
            hasAnyAssignmentThisWeek: assignments.length > 0,
            assignmentCount: assignments.length,
            assignments: assignments.map(a => ({
              id: a.id,
              day: a.assignmentDay,
              points: a.points
            }))
          };
        } catch (err) {
          console.error(`Error checking user ${targetUserId}:`, err);
          return {
            userId: targetUserId,
            hasAnyAssignmentThisWeek: false,
            assignmentCount: 0,
            assignments: []
          };
        }
      })
    );

    console.log(`✅ Batch week check complete: ${results.filter(r => r.hasAnyAssignmentThisWeek).length} users have assignments`);

    return res.json({
      success: true,
      results
    });

  } catch (error: any) {
    console.error('💥💥💥 [BATCH WEEK] CATASTROPHIC ERROR 💥💥💥');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Internal server error",
      error: error.toString()
    });
  }
}

} 