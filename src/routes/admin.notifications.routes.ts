// routes/admin.notifications.routes.ts
import { Router } from "express";
import { AdminNotificationsController } from "../controllers/admin.notifications.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";
import { AuditLog } from "../middlewares/admin.audit.middleware";

const router = Router();

router.use(AdminAuthMiddleware);

// View routes (NO AUDIT)
router.get('/', AdminNotificationsController.getNotifications);
router.get('/unread-count', AdminNotificationsController.getUnreadCount);
router.get('/:notificationId', AdminNotificationsController.getNotificationById);

// Modify routes (WITH AUDIT)
router.patch(
  '/:notificationId/read', 
  AuditLog('MARK_NOTIFICATION_READ', (req) => req.params.notificationId as string), // 👈 ADD 'as string'
  AdminNotificationsController.markAsRead
);

router.post(
  '/mark-all-read', 
  AuditLog('MARK_ALL_NOTIFICATIONS_READ'), // No target user
  AdminNotificationsController.markAllAsRead
);

router.delete(
  '/:notificationId', 
  AuditLog('DELETE_NOTIFICATION', (req) => req.params.notificationId as string), // 👈 ADD 'as string'
  AdminNotificationsController.deleteNotification
);

router.delete(
  '/read/all', 
  AuditLog('DELETE_ALL_READ_NOTIFICATIONS'), // No target user
  AdminNotificationsController.deleteAllRead
);

export default router;