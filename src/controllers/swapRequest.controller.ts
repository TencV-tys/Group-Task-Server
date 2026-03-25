import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { SwapRequestService } from "../services/swapRequest.services";
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
        notifications: result.notifications // Include notification info
      });

    } catch (error: any) {
      console.error("SwapRequestController.createSwapRequest error:", error);
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

// In swapRequest.controller.ts - Add debug logging
static async getGroupSwapRequests(req: UserAuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { groupId } = req.params as {groupId:string};
    const { 
      status,
      limit = 50, 
      offset = 0 
    } = req.query;

    console.log(`📥 getGroupSwapRequests called:`);
    console.log(`   userId: ${userId}`);
    console.log(`   groupId: ${groupId}`);
    console.log(`   status filter: ${status}`);
    console.log(`   limit: ${limit}, offset: ${offset}`);

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

    console.log(`📤 getGroupSwapRequests result:`);
    console.log(`   success: ${result.success}`);
    console.log(`   total requests: ${result.requests?.length}`);
    console.log(`   status filter applied: ${status}`);
    console.log(`   request statuses:`, result.requests?.map((r: any) => r.status));

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
    const { requestId } = req.params as { requestId: string };

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

    // ✅ Build response based on what the service actually returns
    const responseData: any = {
      swapRequest: result.swapRequest,
      previousAssignee: result.previousAssignee,
      scope: result.scope,
      selectedDay: result.selectedDay,
      transferredCount: result.transferredCount,
      notifications: result.notifications
    };

    // ✅ Add new assignee info if exists (from week swap)
    if (result.newAssignee) {
      responseData.newAssignee = result.newAssignee;
    }

    // ✅ Week swap response - both users get assignments
    if (result.scope === 'week') {
      // Check if these properties exist (from the updated service)
      if ('requesterNewAssignments' in result) {
        responseData.requesterNewAssignments = result.requesterNewAssignments;
        responseData.acceptorNewAssignments = result.acceptorNewAssignments;
        responseData.requesterReceivedCount = result.requesterNewAssignments?.length || 0;
        responseData.acceptorReceivedCount = result.acceptorNewAssignments?.length || 0;
      }
    }

    // ✅ Day swap response - single transfer
    if (result.scope === 'day') {
      // Check if newAssignments exists (for day swap)
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
        notifications: result.notifications // Include notification info
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
        notifications: result.notifications // Include notification info
      });

    } catch (error: any) {
      console.error("SwapRequestController.cancelSwapRequest error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
  
    // In swapRequest.controller.ts - FIXED checkCanSwap method

static async checkCanSwap(req: UserAuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { assignmentId } = req.params as {assignmentId:string};
    const { scope, selectedDay, selectedTimeSlotId } = req.query; // Add selectedDay

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

    // ===== DAY SWAP - FIXED: Allow any future day =====
    if (scope === 'day') {
      const dueDate = new Date(assignment.dueDate);
      const dueDateDayIndex = dueDate.getDay();
      const dayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      
      // If selectedDay is provided, check that specific day
      let targetDay = selectedDay as string;
      let targetDate: Date | null = null;
      
      if (targetDay) {
        // Find the next occurrence of that day
        const targetDayIndex = dayNames.indexOf(targetDay);
        if (targetDayIndex === -1) {
          return res.json({
            success: true,
            canSwap: false,
            reason: "Invalid day selected"
          });
        }
        
        // Calculate the target date (next occurrence of that day)
        targetDate = new Date(now);
        let daysToAdd = targetDayIndex - now.getDay();
        if (daysToAdd < 0) daysToAdd += 7;
        targetDate.setDate(now.getDate() + daysToAdd);
        targetDate.setHours(0, 0, 0, 0);
      }
      
      // ✅ Allow swap for ANY future day (not just today)
      // Only block if the due date is in the past
      if (now > dueDate) {
        return res.json({
          success: true,
          canSwap: false,
          reason: "Cannot swap assignments that are already past due"
        });
      }
      
      // Check if trying to swap a day that doesn't exist for this task
      if (assignment.task.executionFrequency === 'WEEKLY' && targetDay) {
        // Get the task's selected days
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
      
      // Check if within time window for today's swap
      if (targetDay && targetDate && targetDate.toDateString() === dueDate.toDateString()) {
        // If swapping for today, check time constraints
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

   
}