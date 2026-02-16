import { Router } from "express";
import { UserNotificationController } from "../controllers/user.notification.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";

const router = Router();

// All routes require authentication
router.use(UserAuthMiddleware);

// Get all notifications
router.get('/', UserNotificationController.getMyNotifications);

// Get unread count
router.get('/unread-count', UserNotificationController.getUnreadCount);

// Mark as read
router.patch('/:notificationId/read', UserNotificationController.markAsRead);

// Mark all as read
router.patch('/mark-all-read', UserNotificationController.markAllAsRead);

// Delete notification
router.delete('/:notificationId', UserNotificationController.deleteNotification);

export default router;