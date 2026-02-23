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

  // GET: Get all swap requests for a group (admin only)
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
          total: result.total
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

   // In swapRequest.controller.ts - UPDATE checkCanSwap
static async checkCanSwap(req: UserAuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { assignmentId } = req.params as {assignmentId:string};

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        task: true
      }
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found"
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

    // Get the swap request scope from query params (if any)
    const { scope } = req.query;
    
    // Check 24 hour rule - ONLY for week swaps, NOT for day swaps
    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    // Only apply 24-hour rule for WEEK swaps
    if (scope === 'week' && hoursUntilDue < 24) {
      return res.json({
        success: true,
        canSwap: false,
        reason: "Cannot swap entire week less than 24 hours before due date"
      });
    }

    // DAY swaps can happen anytime before due date
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