// routes/assignment.routes.ts - COMPLETE UPDATED VERSION
import { Router } from "express";
import { AssignmentController } from "../controllers/assignment.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";

const router = Router();

// All assignment routes require authentication
router.use(UserAuthMiddleware);

// ============= ASSIGNMENT ROUTES =============
// Complete an assignment
router.post('/:assignmentId/complete', AssignmentController.completeAssignment);

// Verify an assignment (admins only)
router.post('/:assignmentId/verify', AssignmentController.verifyAssignment);

// Get assignment details
router.get('/:assignmentId', AssignmentController.getAssignmentDetails);

// NEW: Check if assignment can be submitted (time validation)
router.get('/:assignmentId/check-time', AssignmentController.checkSubmissionTime);

// Get user's assignments
router.get('/user/:userId', AssignmentController.getUserAssignments);

// Get group assignments (admins only)
router.get('/group/:groupId', AssignmentController.getGroupAssignments);

// NEW: Get upcoming assignments
router.get('/upcoming', AssignmentController.getUpcomingAssignments);

// NEW: Get today's assignments
router.get('/today', AssignmentController.getTodayAssignments);

// Get group statistics
router.get('/group/:groupId/stats', AssignmentController.getAssignmentStats);

export default router;