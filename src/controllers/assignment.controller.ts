// controllers/assignment.controller.ts - COMPLETE WITH DETAILED LOGS

import { Response } from "express";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { AssignmentService } from "../services/assignment.services";
import { TimeHelpers } from "../helpers/time.helpers";
import prisma from "../prisma";
  
export class AssignmentController {
  
// controllers/assignment.controller.ts - COMPLETELY UPDATED completeAssignment

static async completeAssignment(req: UserAuthRequest, res: Response) {
  console.log('\n📸🔵 ========== [completeAssignment] ==========');
  console.log('   📝 Assignment ID param:', req.params.assignmentId);
  console.log('   👤 User ID:', req.user?.id);
  console.log('   📸 File present:', !!(req as any).file);
  console.log('   📝 Notes body:', req.body.notes);
  console.log('   ⏰ timeSlotId body:', req.body.timeSlotId);
  console.log('   🖼️ photoUrl body:', req.body.photoUrl);
  
  try {
    const userId = req.user?.id;
    const { assignmentId } = req.params as { assignmentId: string };
    
    let photoUrl = undefined; 
    const file = (req as any).file;
    
    // ✅ PRIORITY 1: Check if photoUrl came from JSON body (Cloudinary URL)
    if (req.body.photoUrl) {
      photoUrl = req.body.photoUrl;
      console.log("   ✅ Photo URL from JSON body (Cloudinary):", photoUrl);
    } 
    // ✅ PRIORITY 2: Check if file was uploaded locally
    else if (file) {
      photoUrl = `/uploads/task-photos/${file.filename}`;
      console.log("   ✅ Photo uploaded locally:", photoUrl);
      console.log("   📁 File details:", {
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
        path: file.path,
        destination: file.destination
      });
    } else {
      console.log("   ⚠️ No photo provided");
    }

    const notes = req.body.notes;
    const timeSlotId = req.body.timeSlotId;
    
    console.log("   📝 Notes received:", notes || '(none)');
    console.log("   ⏰ timeSlotId received:", timeSlotId || '(none)');

    if (!userId) {
      console.log("   ❌ No user ID in request");
      return res.status(401).json({
        success: false,
        message: "User not authenticated"
      });
    }

    if (!assignmentId) {
      console.log("   ❌ No assignment ID in request");
      return res.status(400).json({
        success: false,
        message: "Assignment ID is required"
      });
    }

    console.log("   🔄 Calling AssignmentService.completeAssignment...");
    console.log("   📦 Data being passed:", {
      photoUrl: photoUrl || '(none)',
      notes: notes || undefined,
      timeSlotId: timeSlotId || undefined
    });
    
    const result = await AssignmentService.completeAssignment(
      assignmentId,
      userId,
      { 
        photoUrl: photoUrl,
        notes: notes || undefined,
        timeSlotId: timeSlotId || undefined
      }
    );

    console.log("   📊 Service result:", {
      success: result.success,
      message: result.message,
      isLate: result.isLate,
      finalPoints: result.finalPoints,
      hasAssignment: !!result.assignment
    });

    if (result.success && result.assignment) {
      console.log("   📝 Assignment updated:", {
        id: result.assignment.id,
        completed: result.assignment.completed,
        verified: result.assignment.verified,
        photoUrl: result.assignment.photoUrl,
        points: result.assignment.points
      });
    }

    if (!result.success) {
      console.log("   ❌ Service returned error");
      return res.status(400).json({
        success: false,
        message: result.message,
        validation: result.validation
      }); 
    } 
 
    console.log("   ✅ Assignment completed successfully");
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
    console.error("❌❌❌ [completeAssignment] ERROR:", error);
    console.error("   Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    }); 
  } 
}

  // ========== VERIFY ASSIGNMENT ==========
  static async verifyAssignment(req: UserAuthRequest, res: Response) {
    console.log('\n✅ ========== [verifyAssignment] ==========');
    console.log('   📝 Assignment ID:', req.params.assignmentId);
    console.log('   👤 Admin User ID:', req.user?.id);
    console.log('   ✅ Verified status:', req.body.verified);
    
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as { assignmentId: string };
      const { verified, adminNotes } = req.body;

      if (!userId) {
        console.log("   ❌ No user ID");
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!assignmentId) {
        console.log("   ❌ No assignment ID");
        return res.status(400).json({
          success: false,
          message: "Assignment ID is required"
        });
      }

      console.log("   🔄 Calling AssignmentService.verifyAssignment...");
      const result = await AssignmentService.verifyAssignment(
        assignmentId,
        userId,
        { verified, adminNotes }
      );

      console.log("   📊 Result:", { success: result.success, message: result.message });

      if (!result.success) {
        console.log("   ❌ Verification failed");
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      console.log("   ✅ Verification successful");
      return res.json({
        success: true,
        message: result.message,
        assignment: result.assignment,
        notifications: result.notifications
      });

    } catch (error: any) {
      console.error("❌ [verifyAssignment] ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  } 

  // ========== GET ASSIGNMENT DETAILS ==========
  static async getAssignmentDetails(req: UserAuthRequest, res: Response) {
    console.log('\n🔍 ========== [getAssignmentDetails] ==========');
    console.log('   📝 Assignment ID:', req.params.assignmentId);
    console.log('   👤 User ID:', req.user?.id);
    
    try {
      const userId = req.user?.id;
      const { assignmentId } = req.params as { assignmentId: string };

      if (!userId) {
        console.log("   ❌ No user ID");
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!assignmentId) {
        console.log("   ❌ No assignment ID");
        return res.status(400).json({
          success: false,
          message: "Assignment ID is required"
        });
      }

      console.log("   🔄 Calling AssignmentService.getAssignmentDetails...");
      const result = await AssignmentService.getAssignmentDetails(assignmentId, userId);

      console.log("   📊 Result success:", result.success);

      if (!result.success) {
        console.log("   ❌ Failed to get assignment details");
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      let timeValidation = null;
      if (result.success && result.assignment) {
        if (!result.assignment.completed && result.assignment.timeSlot) {
          timeValidation = TimeHelpers.canSubmitAssignment(result.assignment, new Date());
          console.log("   ⏰ Time validation:", {
            canSubmit: timeValidation.allowed,
            reason: timeValidation.reason
          });
        }
      }

      console.log("   ✅ Assignment details retrieved");
      return res.json({
        success: true,
        message: result.message,
        assignment: {
          ...result.assignment,
          timeValidation
        }
      });

    } catch (error: any) {
      console.error("❌ [getAssignmentDetails] ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

  // ========== GET USER ASSIGNMENTS ==========
  static async getUserAssignments(req: UserAuthRequest, res: Response) {
    console.log('\n👥 ========== [getUserAssignments] ==========');
    console.log('   👤 Requesting user ID:', req.user?.id);
    console.log('   🎯 Target user ID:', req.params.userId);
    console.log('   📊 Query params:', {
      status: req.query.status,
      week: req.query.week,
      limit: req.query.limit,
      offset: req.query.offset
    });
    
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
        console.log("   ❌ No user ID");
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      console.log("   🔄 Calling AssignmentService.getUserAssignments...");
      const result = await AssignmentService.getUserAssignments(
        targetUserId,
        {
          status: status as string,
          week: week !== undefined ? Number(week) : undefined,
          limit: Number(limit),
          offset: Number(offset)
        }
      );

      console.log("   📊 Result:", {
        success: result.success,
        totalAssignments: result.total,
        assignmentsCount: result.assignments?.length
      });

      if (!result.success) {
        console.log("   ❌ Failed to get user assignments");
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      console.log(`   ✅ Returning ${result.assignments?.length || 0} assignments`);
      return res.json({
        success: true,
        message: result.message,
        assignments: result.assignments,
        total: result.total,
        filters: result.filters,
        currentDate: result.currentDate
      });

    } catch (error: any) {
      console.error("❌ [getUserAssignments] ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

 // ========== GET TODAY'S ASSIGNMENTS ==========
static async getTodayAssignments(req: UserAuthRequest, res: Response) {
  console.log('\n📅 ========== [getTodayAssignments] ==========');
  console.log('   👤 User ID:', req.user?.id);
  console.log('   🎯 Group ID filter:', req.query.groupId);
  console.log('   ⏰ Current time:', new Date().toLocaleString());
  console.log('   ⏰ Current ISO:', new Date().toISOString());
  
  try {
    const userId = req.user?.id;
    const { groupId } = req.query;
    
    if (!userId) {
      console.log("   ❌ No user ID");
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      }); 
    }
    
    console.log("   🔄 Calling AssignmentService.getTodayAssignments...");
    const result = await AssignmentService.getTodayAssignments(userId, {
      groupId: groupId as string
    });

    console.log("   📊 Result:", {
      success: result.success,
      total: result.data?.total,
      assignmentsCount: result.data?.assignments?.length
    });

    // ✅ FIXED: Safe check with optional chaining
    if (result.data?.assignments && result.data.assignments.length > 0) {
      const firstAssignment = result.data.assignments[0];
      console.log("   📋 First assignment:", {
        id: firstAssignment?.id || 'N/A',
        title: firstAssignment?.taskTitle || 'N/A',
        dueDate: firstAssignment?.dueDate || 'N/A',
        canSubmit: firstAssignment?.canSubmit ?? false,
        submissionStatus: firstAssignment?.submissionStatus || 'N/A'
      });
    } else {
      console.log("   📭 No assignments due today");
    }

    console.log(`   ✅ Returning ${result.data?.total || 0} today's assignments`);
    return res.status(200).json(result);
    
  } catch (error: any) {
    console.error("❌ [getTodayAssignments] ERROR:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error retrieving today's assignments" 
    });
  }
} 

  // ========== GET UPCOMING ASSIGNMENTS ==========
  static async getUpcomingAssignments(req: UserAuthRequest, res: Response) {
    console.log('\n🎯 ========== [getUpcomingAssignments] ==========');
    console.log("   👤 User ID:", req.user?.id);
    console.log("   📊 Query params:", req.query);
    
    try {
      const userId = req.user?.id;
      const { groupId, limit = 10 } = req.query;
      
      if (!userId) {
        console.log("   ❌ No user ID in request");
        return res.status(401).json({ 
          success: false, 
          message: "Authentication required" 
        });
      }
      
      console.log("   🔄 Calling AssignmentService.getUpcomingAssignments...");
      const result = await AssignmentService.getUpcomingAssignments(userId, {
        groupId: groupId as string,
        limit: limit ? Number(limit) : 10
      });
      
      console.log("   ✅ Service returned:", {
        success: result.success,
        assignmentsCount: result.data?.assignments?.length || 0
      });
      
      return res.status(200).json(result);
      
    } catch (error: any) {
      console.error("❌ [getUpcomingAssignments] ERROR:", error);
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

static async checkSubmissionTime(req: UserAuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { assignmentId } = req.params as {assignmentId:string};

    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }

    console.log(`⏰ ========== [checkSubmissionTime] ==========`);
    console.log(`   📝 Assignment ID: ${assignmentId}`);
    console.log(`   👤 User ID: ${userId}`);

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        task: {
          include: {
            group: {
              select: {
                id: true,
                name: true
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
            email: true
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

    const isAssignee = assignment.userId === userId;
    
    let isGroupAdmin = false;
    if (assignment.task?.groupId) {
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId,
          groupId: assignment.task.groupId,
          groupRole: "ADMIN"
        }
      });
      isGroupAdmin = !!membership;
    }

    console.log(`   👑 Is Admin: ${isGroupAdmin}`);
    console.log(`   👤 Is Assignee: ${isAssignee}`);
    console.log(`   📋 Assignment belongs to: ${assignment.user?.fullName} (${assignment.userId})`);

    if (!isAssignee && !isGroupAdmin) {
      return res.status(403).json({ 
        success: false, 
        message: "You don't have permission to check this assignment",
        isAssignee: false,
        isAdmin: false
      });
    }

    const now = new Date();
    const dueDate = new Date(assignment.dueDate);
    
    // ✅ FIXED: Use UTC for date comparison
    const isDueToday = 
      dueDate.getUTCFullYear() === now.getUTCFullYear() &&
      dueDate.getUTCMonth() === now.getUTCMonth() &&
      dueDate.getUTCDate() === now.getUTCDate();

    // ✅ FIXED: Log using UTC dates
    console.log(`   📅 Due date (UTC): ${dueDate.toISOString()}`);
    console.log(`   📅 Today (UTC): ${now.toISOString()}`);
    console.log(`   📅 Is due today: ${isDueToday}`);

    if (!isDueToday) {
      return res.json({
        success: true,
        canSubmit: false,
        isDueToday: false,
        isAdmin: isGroupAdmin,
        isAssignee: isAssignee,
        dueDate: dueDate.toISOString(),  // ✅ Return ISO string
        reason: `Not due today (due on ${dueDate.toISOString().split('T')[0]})`,
        assignment: {
          id: assignment.id,
          dueDate: assignment.dueDate.toISOString(),
          userId: assignment.userId,
          userName: assignment.user?.fullName
        }
      });
    }

    if (assignment.completed) {
      return res.json({
        success: true,
        canSubmit: false,
        isDueToday: true,
        isAdmin: isGroupAdmin,
        isAssignee: isAssignee,
        reason: "Assignment already completed",
        completedAt: assignment.completedAt?.toISOString()
      });
    }

    const timeSlot = assignment.timeSlot;
    
    if (!timeSlot) {
      return res.json({
        success: true,
        canSubmit: true,
        isDueToday: true,
        isAdmin: isGroupAdmin,
        isAssignee: isAssignee,
        willBePenalized: false,
        finalPoints: assignment.points,
        originalPoints: assignment.points,
        reason: "Available anytime today"
      });
    }

    const validation = TimeHelpers.canSubmitAssignment(assignment, now);
    
    console.log(`⏰ Time validation:`, {
      now: now.toISOString(),
      endTime: timeSlot.endTime,
      canSubmit: validation.allowed,
      reason: validation.reason,
      willBePenalized: validation.willBePenalized,
      timeLeft: validation.timeLeft
    });

    return res.json({
      success: true,
      canSubmit: validation.allowed,
      isDueToday: true,
      isAdmin: isGroupAdmin,
      isAssignee: isAssignee,
      reason: validation.reason,
      timeLeft: validation.timeLeft,
      timeLeftText: validation.timeLeft ? TimeHelpers.getTimeLeftText(validation.timeLeft) : null,
      willBePenalized: validation.willBePenalized || false,
      finalPoints: validation.finalPoints || assignment.points,
      originalPoints: validation.originalPoints || assignment.points,
      submissionStart: validation.submissionStart,
      onTimeEnd: validation.onTimeEnd,
      lateWindowEnd: validation.lateWindowEnd,
      gracePeriodEnd: validation.gracePeriodEnd,
      opensIn: validation.opensIn,
      activeSlot: validation.activeSlot ? {
        id: timeSlot.id,
        startTime: timeSlot.startTime,
        endTime: timeSlot.endTime,
        points: timeSlot.points
      } : null,
      timeSlot: {
        id: timeSlot.id,
        startTime: timeSlot.startTime,
        endTime: timeSlot.endTime,
        points: timeSlot.points,
        label: timeSlot.label
      },
      assignment: {
        id: assignment.id,
        dueDate: assignment.dueDate.toISOString(),
        userId: assignment.userId,
        userName: assignment.user?.fullName
      }
    });

  } catch (error: any) {
    console.error("❌ Error in checkSubmissionTime:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Internal server error",
      error: error.message 
    });
  }
}


  // ========== GET GROUP ASSIGNMENTS ==========
  static async getGroupAssignments(req: UserAuthRequest, res: Response) {
    console.log('\n👥 ========== [getGroupAssignments] ==========');
    console.log('   👤 Admin User ID:', req.user?.id);
    console.log('   🏢 Group ID:', req.params.groupId);
    console.log('   📊 Query:', {
      status: req.query.status,
      week: req.query.week,
      userId: req.query.userId,
      limit: req.query.limit,
      offset: req.query.offset
    }); 
    
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
        console.log("   ❌ No user ID");
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        console.log("   ❌ No group ID");
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      console.log("   🔄 Calling AssignmentService.getGroupAssignments...");
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

      console.log("   📊 Result:", {
        success: result.success,
        total: result.total,
        assignmentsCount: result.assignments?.length
      });

      if (!result.success) {
        console.log("   ❌ Failed to get group assignments");
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      console.log(`   ✅ Returning ${result.assignments?.length || 0} assignments`);
      return res.json({
        success: true,
        message: result.message,
        assignments: result.assignments,
        total: result.total,
        filters: result.filters
      });

    } catch (error: any) {
      console.error("❌ [getGroupAssignments] ERROR:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }

// In assignment.controller.ts - UPDATE getAssignmentStats

static async getAssignmentStats(req: UserAuthRequest, res: Response) {
  console.log('\n📊 ========== [getAssignmentStats] ==========');
  console.log('   🏢 Group ID:', req.params.groupId);
  console.log('   👤 User ID:', req.user?.id);
  
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
    
    // Get members in rotation
    const membersInRotation = await prisma.groupMember.findMany({
      where: { 
        groupId, 
        isActive: true, 
        inRotation: true 
      },
      select: { userId: true }
    });
    
    const memberIdsInRotation = membersInRotation.map(m => m.userId);
    
    // Get all assignments for current week (for members in rotation)
    const assignments = await prisma.assignment.findMany({
      where: {
        task: { groupId },
        rotationWeek: currentWeek.currentRotationWeek,
        userId: { in: memberIdsInRotation }
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
    
    // ✅ FIXED: Count pending verifications (both fully completed AND partially completed with photo)
    const pendingVerificationCount = await prisma.assignment.count({
      where: {
        task: { groupId },
        userId: { in: memberIdsInRotation },
        verified: null,           // Not yet verified
        photoUrl: { not: null },  // Has a submission
        OR: [
          { completed: true },     // Fully completed
          { completed: false }     // Partially completed (multi-slot)
        ]
      }
    });
    
    const totalPoints = assignments.reduce((sum, a) => sum + a.points, 0);
    const completedPoints = assignments.filter(a => a.completed).reduce((sum, a) => sum + a.points, 0);
    const pendingPoints = totalPoints - completedPoints;
    
    console.log("   📊 Stats:", {
      totalAssignments,
      completedAssignments,
      pendingAssignments,
      verifiedAssignments,
      rejectedAssignments,
      pendingVerificationCount,  // ← Now includes partial submissions
      totalPoints,
      completedPoints
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
          pendingVerification: pendingVerificationCount,  // ✅ Updated
          totalPoints,
          completedPoints,
          pendingPoints
        },
        assignments: assignments.slice(0, 10)
      }
    });
    
  } catch (error: any) {
    console.error("❌ [getAssignmentStats] ERROR:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error retrieving assignment statistics" 
    });
  } 
}

  // ========== GET USER NEGLECTED TASKS ==========
  static async getUserNeglectedTasks(req: UserAuthRequest, res: Response) {
    console.log('\n⚠️ ========== [getUserNeglectedTasks] ==========');
    console.log('   👤 User ID:', req.user?.id);
    console.log('   📊 Query:', {
      groupId: req.query.groupId,
      limit: req.query.limit,
      offset: req.query.offset
    });
    
    try {
      const userId = req.user?.id;
      const { groupId, limit = 20, offset = 0 } = req.query;

      if (!userId) {
        console.log("   ❌ No user ID");
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      console.log("   🔄 Calling AssignmentService.getUserNeglectedTasks...");
      const result = await AssignmentService.getUserNeglectedTasks(userId, {
        groupId: groupId as string,
        limit: Number(limit),
        offset: Number(offset)
      });

      const tasksCount = result.data?.tasks?.length || 0;
      console.log(`   📊 Found ${tasksCount} neglected tasks`);

      if (!result.success) {
        console.log("   ❌ Failed to get neglected tasks");
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      console.log(`   ✅ Returning ${tasksCount} neglected tasks`);
      return res.json({
        success: true,
        message: result.message,
        data: result.data
      });

    } catch (error: any) {
      console.error("❌ [getUserNeglectedTasks] ERROR:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Error retrieving neglected tasks"
      });
    }
  }

  // ========== GET GROUP NEGLECTED TASKS (ADMIN ONLY) ==========
  static async getGroupNeglectedTasks(req: UserAuthRequest, res: Response) {
    console.log('\n⚠️👑 ========== [getGroupNeglectedTasks] ==========');
    console.log('   👤 Admin User ID:', req.user?.id);
    console.log('   🏢 Group ID:', req.params.groupId);
    console.log('   📊 Query:', {
      memberId: req.query.memberId,
      limit: req.query.limit,
      offset: req.query.offset
    });
    
    try {
      const userId = req.user?.id;
      const { groupId } = req.params as { groupId: string };
      const { memberId, limit = 20, offset = 0 } = req.query;

      if (!userId) {
        console.log("   ❌ No user ID");
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!groupId) {
        console.log("   ❌ No group ID");
        return res.status(400).json({
          success: false,
          message: "Group ID is required"
        });
      }

      console.log("   🔄 Calling AssignmentService.getGroupNeglectedTasks...");
      const result = await AssignmentService.getGroupNeglectedTasks(
        groupId,
        userId,
        {
          memberId: memberId as string,
          limit: Number(limit),
          offset: Number(offset)
        }
      );

      const tasksCount = result.data?.tasks?.length || 0;
      console.log(`   📊 Found ${tasksCount} neglected tasks in group`);

      if (!result.success) {
        console.log("   ❌ Failed to get group neglected tasks");
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      console.log(`   ✅ Returning ${tasksCount} group neglected tasks`);
      return res.json({
        success: true,
        message: result.message,
        data: result.data
      });

    } catch (error: any) {
      console.error("❌ [getGroupNeglectedTasks] ERROR:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Error retrieving group neglected tasks"
      });
    }
  }


  // In assignment.controller.ts - Add this new method

// ========== GET PENDING VERIFICATIONS (DEDICATED ENDPOINT) ==========
static async getPendingVerifications(req: UserAuthRequest, res: Response) {
  console.log('\n📋 ========== [getPendingVerifications] ==========');
  console.log('   👤 Admin User ID:', req.user?.id);
  console.log('   🏢 Group ID:', req.params.groupId);
  console.log('   📊 Query:', {
    limit: req.query.limit,
    offset: req.query.offset
  });
  
  try {
    const userId = req.user?.id;
    const { groupId } = req.params as {groupId:string};
    const { limit = 20, offset = 0 } = req.query;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }
    
    // Check if user is admin of this group
    const membership = await prisma.groupMember.findFirst({
      where: { 
        userId, 
        groupId, 
        groupRole: "ADMIN" 
      }
    });
    
    if (!membership) {
      return res.status(403).json({ 
        success: false, 
        message: "Only group admins can view pending verifications" 
      });
    }
    
    // Get members in rotation for this group
    const membersInRotation = await prisma.groupMember.findMany({
      where: { 
        groupId, 
        isActive: true, 
        inRotation: true 
      },
      select: { userId: true }
    });
    
    const memberIdsInRotation = membersInRotation.map(m => m.userId);
    
    // Get all assignments pending verification
    // This includes:
    // 1. Fully completed assignments waiting for verification (completed = true, verified = null)
    // 2. Partially completed multi-slot assignments with photo (completed = false, verified = null, has photo)
    const where = {
      task: { groupId },
      userId: { in: memberIdsInRotation },
      verified: null,           // Not yet verified
      photoUrl: { not: null },  // Has a submission
      OR: [
        { completed: true },                    // Fully completed
        { completed: false }                    // Partially completed (multi-slot)
      ]
    };
    
    const [assignments, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
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
              points: true,
              executionFrequency: true,
              timeSlots: {
                select: {
                  id: true,
                  startTime: true,
                  endTime: true,
                  label: true,
                  points: true
                }
              }
            } 
          },
          timeSlot: {
            select: {
              id: true,
              startTime: true,
              endTime: true,
              label: true,
              points: true
            }
          }
        },
        orderBy: { updatedAt: 'desc' },
        take: Number(limit),
        skip: Number(offset)
      }),
      prisma.assignment.count({ where })
    ]);
    
    console.log(`✅ Found ${assignments.length} pending verifications out of ${total} total`);
    
    // Format the response
    const formattedAssignments = assignments.map(assignment => {
      const isMultiSlot = assignment.task?.timeSlots && assignment.task.timeSlots.length > 1;
      const completedSlotIds = (assignment as any).completedTimeSlotIds || [];
      const totalSlots = assignment.task?.timeSlots?.length || 1;
      const slotsCompleted = completedSlotIds.length;
      
      return {
        id: assignment.id,
        taskId: assignment.taskId,
        taskTitle: assignment.task?.title || 'Unknown Task',
        taskPoints: assignment.task?.points || assignment.points || 0,
        executionFrequency: assignment.task?.executionFrequency,
        userName: assignment.user?.fullName || 'Unknown User',
        userAvatar: assignment.user?.avatarUrl,
        userId: assignment.userId,
        submittedAt: assignment.updatedAt,
        dueDate: assignment.dueDate,
        photoUrl: assignment.photoUrl,
        notes: assignment.notes,
        adminNotes: assignment.adminNotes,
        timeSlot: assignment.timeSlot ? {
          startTime: assignment.timeSlot.startTime,
          endTime: assignment.timeSlot.endTime,
          label: assignment.timeSlot.label,
          points: assignment.timeSlot.points
        } : null,
        isMultiSlot,
        slotsCompleted,
        totalSlots,
        completed: assignment.completed,
        verified: assignment.verified,
        isPartial: !assignment.completed && isMultiSlot && slotsCompleted > 0
      };
    });
    
    return res.status(200).json({
      success: true,
      message: "Pending verifications retrieved successfully",
      data: {
        assignments: formattedAssignments,
        total,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: (Number(offset) + formattedAssignments.length) < total
      }
    });
    
  } catch (error: any) {
    console.error("❌ [getPendingVerifications] ERROR:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Error retrieving pending verifications" 
    });
  }
}

}