import { Router } from "express";
import { FeedbackController } from "../controllers/feedback.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";

const router = Router();

// All routes require authentication
router.use(UserAuthMiddleware);

// Submit feedback
router.post('/submit', FeedbackController.submitFeedback);

// Get my feedback
router.get('/my-feedback', FeedbackController.getMyFeedback);

// Get my feedback stats
router.get('/my-stats', FeedbackController.getMyFeedbackStats);

// Get single feedback
router.get('/:feedbackId', FeedbackController.getFeedbackDetails);

// UPDATE feedback - NEW ROUTE
router.put('/:feedbackId', FeedbackController.updateMyFeedback);

// Delete feedback
router.delete('/:feedbackId', FeedbackController.deleteMyFeedback);

export default router;