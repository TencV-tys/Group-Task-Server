// controllers/assignment.controller.ts - COMPLETE UPDATED VERSION
import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { AssignmentService } from "../services/assignment.services";
import { TimeHelpers } from "../helpers/time.helpers";
import prisma from "../prisma";

export class AssignmentController {
  
  // ========== COMPLETE ASSIGNMENT ==========
  static async completeAssignment(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as { assignmentId: string };
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
 
  // ========== VERIFY ASSIGNMENT ==========
  static async verifyAssignment(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as { assignmentId: string };
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

  // ========== GET ASSIGNMENT DETAILS ==========
  static async getAssignmentDetails(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as { assignmentId: string };

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

  // ========== GET USER ASSIGNMENTS ==========
  static async getUserAssignments(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { userId: targetUserId } = req.params as { userId: string };
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

  // ========== GET GROUP ASSIGNMENTS ==========
  static async getGroupAssignments(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
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
 
  // ========== CHECK SUBMISSION TIME ==========
  static async checkSubmissionTime(req: UserAuthRequest, res: Response) {
    try {
      const { assignmentId } = req.params as { assignmentId: string };
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
          timeSlot: true,
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
      
      if (assignment.userId !== userId) {
        return res.status(403).json({ 
          success: false, 
          message: "You can only check your own assignments" 
        });
      }
      
      const now = new Date();
      
      const assignmentForValidation = {
        ...assignment,
        timeSlot: assignment.timeSlot
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
          timeSlot: assignment.timeSlot,
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

  // In assignment.controller.ts - update getUpcomingAssignments
static async getUpcomingAssignments(req: UserAuthRequest, res: Response) {
  console.log("🎯 CONTROLLER: getUpcomingAssignments STARTED");
  console.log("👤 User from middleware:", req.user);
  console.log("📊 Query params:", req.query);
  
  try {
    const userId = req.user?.id;
    const { groupId, limit = 10 } = req.query;
    
    console.log("📋 Processing with userId:", userId);
    console.log("🔍 Calling AssignmentService.getUpcomingAssignments...");
    
    if (!userId) {
      console.log("❌ No user ID in request");
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      });
    }
    
    const result = await AssignmentService.getUpcomingAssignments(userId, {
      groupId: groupId as string,
      limit: limit ? Number(limit) : 10
    });
    
    console.log("✅ Service returned with success:", result.success);
    console.log("📦 Number of assignments:", result.data?.assignments?.length || 0);
    
    return res.status(200).json(result);
    
  } catch (error: any) {
    console.error("❌ CONTROLLER ERROR:", error);
    console.error("❌ Error stack:", error.stack);
    return res.status(500).json({ 
      success: false, 
      message: error.message,
      data: {
        assignments: [],
        currentTime: new Date(),
        total: 0
      }
    });
  }
}

  // ========== GET TODAY'S ASSIGNMENTS ==========
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
      
      const result = await AssignmentService.getTodayAssignments(userId, {
        groupId: groupId as string
      });

      return res.status(200).json(result);
      
    } catch (error: any) {
      console.error("AssignmentController.getTodayAssignments error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Error retrieving today's assignments" 
      });
    }
  }

  // ========== GET ASSIGNMENT STATISTICS ==========
  static async getAssignmentStats(req: UserAuthRequest, res: Response) {
    try {
      const { groupId } = req.params as { groupId: string };
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required" 
        });
      }
      
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
      
      const totalAssignments = assignments.length;
      const completedAssignments = assignments.filter(a => a.completed).length;
      const pendingAssignments = totalAssignments - completedAssignments;
      
      const verifiedAssignments = assignments.filter(a => a.verified === true).length;
      const rejectedAssignments = assignments.filter(a => a.verified === false).length;
      const pendingVerification = assignments.filter(a => a.completed && a.verified === null).length;
      
      const totalPoints = assignments.reduce((sum, a) => sum + a.points, 0);
      const completedPoints = assignments
        .filter(a => a.completed)
        .reduce((sum, a) => sum + a.points, 0);
      const pendingPoints = totalPoints - completedPoints;
      
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