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

 // In SwapRequestController.ts - Update getGroupSwapRequests method
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
        stats: result.stats // Include rotation stats for admin view
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

      // Build response dynamically based on scope
      const responseData: any = {
        swapRequest: result.swapRequest,
        previousAssignee: result.previousAssignee,
        scope: result.scope,
        selectedDay: result.selectedDay,
        selectedTimeSlotId: result.selectedTimeSlotId,
        notifications: result.notifications // Include notification info
      };

      // Add scope-specific fields - ONLY if they exist
      if (result.scope === 'week' && result.newAssignment) {
        responseData.newAssignment = result.newAssignment;
      }

      if (result.scope === 'day') {
        if (result.newAssignments) {
          responseData.newAssignments = result.newAssignments;
        }
        if (result.transferredCount !== undefined) {
          responseData.transferredCount = result.transferredCount;
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
  // In swapRequest.controller.ts - FIX THIS

static async checkCanSwap(req: UserAuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { assignmentId } = req.params as {assignmentId:string};
    const { scope } = req.query;

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
            timeSlots: true // Add this to include timeSlots
          }
        },
        timeSlot: true // Include timeSlot for the assignment
      }
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found"
      });
    }

    // Check if task exists
    if (!assignment.task) {
      return res.json({
        success: true,
        canSwap: false,
        reason: "The task associated with this assignment has been deleted"
      });
    }

    // Check if assignment belongs to user
    if (assignment.userId !== userId) {
      return res.json({
        success: true,
        canSwap: false,
        reason: "You can only request swap for your own assignments"
      });
    }

    // Check if already completed
    if (assignment.completed) {
      return res.json({
        success: true,
        canSwap: false,
        reason: "Cannot swap completed assignments"
      });
    }

    // Check if there's already a pending swap request
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

    // ===== FIXED: For WEEK swaps, check based on group's FIRST TASK creation date =====
    if (scope === 'week') {
      // Get the first task creation date for this group
      const firstTask = assignment.task.group?.tasks?.[0];
      if (!firstTask) {
        return res.json({
          success: true,
          canSwap: false,
          reason: "Cannot determine week start date - no tasks found"
        });
      }

      // Calculate week start based on first task date
      const firstTaskDate = new Date(firstTask.createdAt);
      const firstTaskDay = firstTaskDate.getDay(); // 0-6 (Sun-Sat)
      
      // Calculate days since start of current week
      const today = now.getDay();
      let daysSinceWeekStart = today - firstTaskDay;
      if (daysSinceWeekStart < 0) daysSinceWeekStart += 7;
      
      // Set week start to the correct day (the day first task was created)
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - daysSinceWeekStart);
      weekStart.setHours(0, 0, 0, 0);
      
      // Calculate hours since week started
      const hoursSinceWeekStart = (now.getTime() - weekStart.getTime()) / (1000 * 60 * 60);
      
      // Get current week number
      const daysSinceFirstTask = Math.floor(
        (now.getTime() - firstTaskDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const currentWeekNumber = Math.floor(daysSinceFirstTask / 7) + 1;
      
      const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      console.log(`📅 Week check for group:`, {
        firstTaskDate: firstTaskDate.toISOString(),
        firstTaskDay: weekDayNames[firstTaskDay],
        weekStart: weekStart.toISOString(),
        weekStartDay: weekDayNames[weekStart.getDay()],
        hoursSinceWeekStart,
        currentWeekNumber,
        daysSinceWeekStart
      });
      
      // Week swap available within first 24 hours of the week
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
          weekNumber: currentWeekNumber,
          weekStart: weekStart.toISOString(),
          weekStartDay: weekDayNames[firstTaskDay],
          hoursLeft: Math.max(0, 24 - hoursSinceWeekStart)
        }
      });
    }

   
      // For DAY swaps, check if it's the same day
if (scope === 'day') {
  const dueDate = new Date(assignment.dueDate);
  const today = new Date();
  
  if (dueDate.toDateString() !== today.toDateString()) {
    return res.json({
      success: true,
      canSwap: false,
      reason: "Day swaps can only be requested on the day the task is due"
    });
  }
  
  // Check if still within swap window (before end time)
  if (assignment.timeSlot && assignment.timeSlot.endTime) {
    const timeParts = assignment.timeSlot.endTime.split(':');
    
    // Validate that we have both hour and minute and they exist
    if (timeParts.length >= 2) {
      const hourStr = timeParts[0];
      const minuteStr = timeParts[1];
      
      // Check if they're not undefined
      if (hourStr !== undefined && minuteStr !== undefined) {
        const endHour = parseInt(hourStr, 10);
        const endMinute = parseInt(minuteStr, 10);
        
        // Check if parsing was successful
        if (!isNaN(endHour) && !isNaN(endMinute)) {
          const endTime = new Date(dueDate);
          endTime.setHours(endHour, endMinute, 0, 0);
          
          // Can swap up until the end time
          if (now > endTime) {
            return res.json({
              success: true,
              canSwap: false,
              reason: "Cannot swap after the task's end time"
            });
          }
        }
      }
    }
  }
  
  return res.json({
    success: true,
    canSwap: true
  });
}
    

    // Default to true for no scope specified
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