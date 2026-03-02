import { Router } from "express";
import { AdminNotificationsController } from "../controllers/admin.notifications.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";

const router = Router();

// All routes require admin authentication
router.use(AdminAuthMiddleware);

// ========== NOTIFICATION MANAGEMENT ROUTES ==========
// Get all notifications with filters
router.get('/', AdminNotificationsController.getNotifications);

// Get unread count
router.get('/unread-count', AdminNotificationsController.getUnreadCount);

// Get single notification
router.get('/:notificationId', AdminNotificationsController.getNotificationById);

// Mark as read
router.patch('/:notificationId/read', AdminNotificationsController.markAsRead);

// Mark all as read
router.post('/mark-all-read', AdminNotificationsController.markAllAsRead);

// Delete notification
router.delete('/:notificationId', AdminNotificationsController.deleteNotification);

// Delete all read notifications
router.delete('/read/all', AdminNotificationsController.deleteAllRead);

export default router;