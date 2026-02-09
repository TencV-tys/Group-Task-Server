// routes/assignment.routes.ts - NEW FILE
import { Router } from "express";
import { AssignmentController } from "../controllers/assignment.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";

const router = Router();

// All assignment routes require authentication
router.use(UserAuthMiddleware);

// ============= ASSIGNMENT ROUTES =============
// Complete an assignment (for regular users)
router.post('/:assignmentId/complete', AssignmentController.completeAssignment);

// Verify an assignment (for admins)
router.post('/:assignmentId/verify', AssignmentController.verifyAssignment);

// Get assignment details
router.get('/:assignmentId', AssignmentController.getAssignmentDetails);

// Get user's assignments (with filters)
router.get('/user/:userId/assignments', AssignmentController.getUserAssignments);

// Get group assignments (for admins)
router.get('/group/:groupId/assignments', AssignmentController.getGroupAssignments);

export default router;