// routes/user.notification.routes.ts - FULL CORRECT VERSION
import { Router } from "express";
import { UserNotificationController } from "../controllers/user.notification.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";

const router = Router();

// All routes require authentication
router.use(UserAuthMiddleware);

// ========== SPECIFIC ROUTES (no parameters) ==========
router.get('/', UserNotificationController.getMyNotifications);
router.get('/unread-count', UserNotificationController.getUnreadCount);
router.post('/register-push-token', UserNotificationController.registerPushToken);
router.patch('/mark-all-read', UserNotificationController.markAllAsRead);
router.delete('/delete-all', UserNotificationController.deleteAllNotifications);  // ✅ SPECIFIC FIRST

// ========== PARAMETER ROUTES (with :id) ==========
router.patch('/:notificationId/read', UserNotificationController.markAsRead);
router.delete('/:notificationId', UserNotificationController.deleteNotification);

export default router;