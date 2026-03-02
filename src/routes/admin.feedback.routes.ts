import { Router } from "express";
import { AdminFeedbackController } from "../controllers/admin.feedback.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";

const router = Router();

// All routes require admin authentication
router.use(AdminAuthMiddleware);

// ========== FEEDBACK MANAGEMENT ROUTES ==========
// Get all feedback with filters
router.get('/', AdminFeedbackController.getFeedback);

// Get feedback stats
router.get('/stats', AdminFeedbackController.getFeedbackStats);

// Get single feedback details
router.get('/:feedbackId', AdminFeedbackController.getFeedbackById);

// Update feedback status
router.patch('/:feedbackId/status', AdminFeedbackController.updateFeedbackStatus);


// Delete feedback
router.delete('/:feedbackId', AdminFeedbackController.deleteFeedback);

export default router;