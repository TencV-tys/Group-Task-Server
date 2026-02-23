// controllers/assignment.controller.ts - COMPLETE UPDATED VERSION
import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { AssignmentService } from "../services/assignment.services";
import { TimeHelpers } from "../helpers/time.helpers";
import prisma from "../prisma";

export class AssignmentController {
  
  static async completeAssignment(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as { assignmentId:string };
      const { photoUrl, notes } = req.body;

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

      const result = await AssignmentService.completeAssignment(
        assignmentId,
        userId,
        { photoUrl, notes } 
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message,
          validation: result.validation
        });
      }

      return res.json({
        success: true,
        message: result.message,
        assignment: result.assignment,
        isLate: result.isLate,
        penaltyAmount: result.penaltyAmount,
        originalPoints: result.originalPoints,
        finalPoints: result.finalPoints,
        notifications: result.notifications
      });

    } catch (error: any) {
      console.error("AssignmentController.completeAssignment error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  } 
 
  static async verifyAssignment(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as { assignmentId:string };
      const { verified, adminNotes } = req.body;

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

      const result = await AssignmentService.verifyAssignment(
        assignmentId,
        userId,
        { verified, adminNotes }
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
        assignment: result.assignment,
        notifications: result.notifications
      });

    } catch (error: any) {
      console.error("AssignmentController.verifyAssignment error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  } 

  static async getAssignmentDetails(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as {assignmentId:string};

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

      const result = await AssignmentService.getAssignmentDetails(assignmentId, userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      // Add time validation for frontend
let timeValidation = null;
if (result.success && result.assignment) {
  if (!result.assignment.completed && result.assignment.timeSlot) {
    timeValidation = TimeHelpers.canSubmitAssignment(result.assignment, new Date());
  }
}

      return res.json({
        success: true,
        message: result.message,
        assignment: {
          ...result.assignment,
          timeValidation
        }
      });

    } catch (error: any) {
      console.error("AssignmentController.getAssignmentDetails error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  static async getUserAssignments(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { userId: targetUserId } = req.params as {userId:string};
      const { 
        status,
        week,
        limit = 20,
        offset = 0 
      } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const result = await AssignmentService.getUserAssignments(
        targetUserId,
        {
          status: status as string,
          week: week !== undefined ? Number(week) : undefined,
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
        assignments: result.assignments,
        total: result.total,
        filters: result.filters,
        currentDate: result.currentDate
      });

    } catch (error: any) {
      console.error("AssignmentController.getUserAssignments error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  static async getGroupAssignments(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as {groupId:string};
      const { 
        status,
        week,
        userId: filterUserId,
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

      const result = await AssignmentService.getGroupAssignments(
        groupId,
        userId,
        {
          status: status as string,
          week: week !== undefined ? Number(week) : undefined,
          userId: filterUserId as string,
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
        assignments: result.assignments,
        total: result.total,
        filters: result.filters
      });

    } catch (error: any) {
      console.error("AssignmentController.getGroupAssignments error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
 
  // ========== NEW: Check submission time ==========
 static async checkSubmissionTime(req: UserAuthRequest, res: Response) {
    try {
      const { assignmentId } = req.params as { assignmentId:string };
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required" 
        });
      }
      
      const assignment = await prisma.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          timeSlot: true, // This should work if the relation is defined in schema
          task: {
            include: {
              timeSlots: {
                orderBy: { sortOrder: 'asc' }
              }
            }
          }
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
        return res.status(403).json({ 
          success: false, 
          message: "You can only check your own assignments" 
        });
      }
      
      const now = new Date();
      
      // Create a properly shaped object for TimeHelpers
      const assignmentForValidation = {
        ...assignment,
        timeSlot: assignment.timeSlot // This should exist from include
      };
      
      const validation = TimeHelpers.canSubmitAssignment(assignmentForValidation, now);
      
      return res.status(200).json({
        success: true,
        message: "Submission time check completed",
        data: { 
          assignmentId,
          canSubmit: validation.allowed,
          reason: validation.reason,
          timeLeft: validation.timeLeft,
          timeLeftText: validation.timeLeft ? TimeHelpers.getTimeLeftText(validation.timeLeft) : null,
          submissionStart: validation.submissionStart,
          gracePeriodEnd: validation.gracePeriodEnd,
          currentTime: now,
          dueDate: assignment.dueDate,
          timeSlot: assignment.timeSlot, // This should work now
          willBePenalized: validation.willBePenalized,
          finalPoints: validation.finalPoints,
          originalPoints: validation.originalPoints
        }
      });
      
    } catch (error: any) {
      console.error("AssignmentController.checkSubmissionTime error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Error checking submission time" 
      });
    }
  }
// ========== GET UPCOMING ASSIGNMENTS ==========
static async getUpcomingAssignments(req: UserAuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { groupId, limit = 10 } = req.query;
    
    if (!userId) { 
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      });
    }
    
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const assignments = await prisma.assignment.findMany({
      where: {
        userId,
        task: groupId ? { groupId: String(groupId) } : undefined,
        completed: false,
        dueDate: {
          gte: today
        }
      },
      include: {
        timeSlot: true,
        task: {
          select: {
            id: true,
            title: true,
            points: true,
            group: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: { dueDate: 'asc' },
      take: Number(limit)
    });
    
    const assignmentsWithTimeInfo = assignments.map(assignment => {
      const dueDate = new Date(assignment.dueDate);
      const isToday = dueDate.toDateString() === today.toDateString();
      const validation = isToday && assignment.timeSlot ? 
        TimeHelpers.canSubmitAssignment(assignment, now) : null;
      
      return {
        id: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task.title,
        taskPoints: assignment.task.points,
        group: assignment.task.group,
        dueDate: assignment.dueDate,
        isToday,
        canSubmit: validation?.allowed || (isToday && !assignment.timeSlot) || false,
        timeLeft: validation?.timeLeft || null,
        timeLeftText: validation?.timeLeft ? TimeHelpers.getTimeLeftText(validation.timeLeft) : null,
        willBePenalized: validation?.willBePenalized || false,
        timeSlot: assignment.timeSlot,
        completed: assignment.completed,
        verified: assignment.verified
      };
    });
    
    return res.status(200).json({
      success: true,
      message: "Upcoming assignments retrieved",
      data: {
        assignments: assignmentsWithTimeInfo,
        currentTime: now,
        total: assignments.length
      }
    });
    
  } catch (error: any) {
    console.error("Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error retrieving upcoming assignments",
      data: {
        assignments: [],
        currentTime: new Date(),
        total: 0
      }
    });
  }
}

  // ========== NEW: Get today's assignments ==========
  static async getTodayAssignments(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.query;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required" 
        }); 
      }
      
      const now = new Date();
      const today = now.toDateString();
      
      const assignments = await prisma.assignment.findMany({
        where: {
          userId,
          task: groupId ? { groupId: String(groupId) } : undefined,
          completed: false
        },
        include: {
          timeSlot: true,
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
          }
        }
      });
      
      // Filter for today's assignments
      const todayAssignments = assignments.filter(assignment => {
        const dueDate = new Date(assignment.dueDate);
        return dueDate.toDateString() === today;
      });
      
      // Add time validation info
      const assignmentsWithTimeInfo = todayAssignments.map(assignment => {
        const validation = TimeHelpers.canSubmitAssignment(assignment, now);
        
        return {
          id: assignment.id,
          taskId: assignment.taskId,
          taskTitle: assignment.task.title,
          taskPoints: assignment.task.points,
          group: assignment.task.group,
          dueDate: assignment.dueDate,
          canSubmit: validation.allowed,
          timeLeft: validation.timeLeft,
          timeLeftText: validation.timeLeft ? TimeHelpers.getTimeLeftText(validation.timeLeft) : null,
          reason: validation.reason,
          timeSlot: assignment.timeSlot,
          willBePenalized: validation.willBePenalized,
          finalPoints: validation.finalPoints
        };
      });
      
      return res.status(200).json({
        success: true,
        message: "Today's assignments retrieved",
        data: {
          assignments: assignmentsWithTimeInfo,
          currentTime: now,
          total: assignmentsWithTimeInfo.length
        }
      });
      
    } catch (error: any) {
      console.error("AssignmentController.getTodayAssignments error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Error retrieving today's assignments" 
      });
    }
  }

  // ========== Get assignment statistics ==========
  static async getAssignmentStats(req: UserAuthRequest, res: Response) {
    try {
      const { groupId } = req.params as {groupId:string};
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required" 
        });
      }
      
      // Check if user is member of group
      const membership = await prisma.groupMember.findFirst({
        where: { userId, groupId }
      });
      
      if (!membership) {
        return res.status(403).json({ 
          success: false, 
          message: "You are not a member of this group" 
        });
      }
      
      const currentWeek = await prisma.group.findUnique({
        where: { id: groupId },
        select: { currentRotationWeek: true }
      });
      
      if (!currentWeek) {
        return res.status(404).json({ 
          success: false, 
          message: "Group not found" 
        });
      }
      
      // Get all assignments for current week
      const assignments = await prisma.assignment.findMany({
        where: {
          task: { groupId },
          rotationWeek: currentWeek.currentRotationWeek
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true
            }
          },
          task: {
            select: {
              id: true,
              title: true,
              points: true
            }
          },
          timeSlot: true
        }
      });
      
      // Calculate statistics
      const totalAssignments = assignments.length;
      const completedAssignments = assignments.filter(a => a.completed).length;
      const pendingAssignments = totalAssignments - completedAssignments;
      
      const verifiedAssignments = assignments.filter(a => a.verified === true).length;
      const rejectedAssignments = assignments.filter(a => a.verified === false).length;
      const pendingVerification = assignments.filter(a => a.completed && a.verified === null).length;
      
      // Calculate points
      const totalPoints = assignments.reduce((sum, a) => sum + a.points, 0);
      const completedPoints = assignments
        .filter(a => a.completed)
        .reduce((sum, a) => sum + a.points, 0);
      const pendingPoints = totalPoints - completedPoints;
      
      // Group by user
      const userStats: Record<string, any> = {};
      assignments.forEach(assignment => {
        const userId = assignment.userId;
        if (!userStats[userId]) {
          userStats[userId] = {
            userId,
            userName: assignment.user.fullName,
            avatarUrl: assignment.user.avatarUrl,
            totalAssignments: 0,
            completedAssignments: 0,
            totalPoints: 0,
            completedPoints: 0,
            lateSubmissions: 0
          };
        }
        
        userStats[userId].totalAssignments++;
        userStats[userId].totalPoints += assignment.points;
        
        if (assignment.completed) {
          userStats[userId].completedAssignments++;
          userStats[userId].completedPoints += assignment.points;
          
          // Check if late (based on notes)
          if (assignment.notes?.includes('LATE')) {
            userStats[userId].lateSubmissions++;
          }
        }
      });
      
      return res.status(200).json({
        success: true,
        message: "Assignment statistics retrieved",
        data: {
          groupId,
          currentWeek: currentWeek.currentRotationWeek,
          summary: {
            totalAssignments,
            completedAssignments,
            pendingAssignments,
            verifiedAssignments,
            rejectedAssignments,
            pendingVerification,
            totalPoints,
            completedPoints,
            pendingPoints
          },
          userStats: Object.values(userStats),
          assignments: assignments.slice(0, 10)
        }
      });
      
    } catch (error: any) {
      console.error("AssignmentController.getAssignmentStats error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Error retrieving assignment statistics" 
      });
    }
  }
}