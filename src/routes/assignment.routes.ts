// routes/assignment.routes.ts - ADD THE NEW ROUTE

import { Router } from "express";
import { AssignmentController } from "../controllers/assignment.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";
import { photoUpload } from "../utils/multer";

const router = Router();

// Log all routes as they're registered
router.use((req, res, next) => {
  next();
}); 

// All assignment routes require authentication
router.use(UserAuthMiddleware);
  
// ============= ASSIGNMENT ROUTES =============
// Complete an assignment - with photo upload support
router.post(  
  '/:assignmentId/complete', 
  photoUpload,
  AssignmentController.completeAssignment
);

// Verify an assignment (admins only)
router.post('/:assignmentId/verify', AssignmentController.verifyAssignment);

// Get assignment details
router.get('/:assignmentId', AssignmentController.getAssignmentDetails);

// Check if assignment can be submitted (time validation)
router.get('/:assignmentId/check-time', AssignmentController.checkSubmissionTime);

// Get user's assignments
router.get('/user/:userId', AssignmentController.getUserAssignments);

// Get group assignments (admins only)
router.get('/group/:groupId', AssignmentController.getGroupAssignments);

// ✅ ADD THIS NEW ROUTE - Get pending verifications (admins only)
router.get('/group/:groupId/pending-verifications', AssignmentController.getPendingVerifications);

// Get upcoming assignments
router.get('/upcoming', AssignmentController.getUpcomingAssignments);

// Get today's assignments
router.get('/today', AssignmentController.getTodayAssignments);

// Get group statistics
router.get('/group/:groupId/stats', AssignmentController.getAssignmentStats);

// Get user's neglected tasks (for members)
router.get('/neglected/my', AssignmentController.getUserNeglectedTasks);

// Get group's neglected tasks (for admins)
router.get('/neglected/group/:groupId', AssignmentController.getGroupNeglectedTasks);

export default router;