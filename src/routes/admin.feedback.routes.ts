// routes/admin.feedback.routes.ts - ADD AUDIT
import { Router } from "express";
import { AdminFeedbackController } from "../controllers/admin.feedback.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";
import { AuditLog } from "../middlewares/admin.audit.middleware"; // 👈 ADD

const router = Router();

router.use(AdminAuthMiddleware);

// View routes (NO AUDIT)
router.get('/', AdminFeedbackController.getFeedback);
router.get('/stats', AdminFeedbackController.getFeedbackStats);
router.get('/:feedbackId', AdminFeedbackController.getFeedbackById);

// Modify routes (WITH AUDIT)
router.patch(
  '/:feedbackId/status', 
  AuditLog('UPDATE_FEEDBACK_STATUS', (req) => req.params.feedbackId as string), // 👈 ADD AUDIT
  AdminFeedbackController.updateFeedbackStatus
);

router.delete(
  '/:feedbackId', 
  AuditLog('DELETE_FEEDBACK', (req) => req.params.feedbackId as string), // 👈 ADD AUDIT
  AdminFeedbackController.deleteFeedback
);

export default router;