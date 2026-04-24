// routes/admin.audit.routes.ts
import { Router } from "express";
import { AdminAuditController } from "../controllers/admin.audit.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";
import { AuditLog } from "../middlewares/admin.audit.middleware"; // 👈 ADD

const router = Router();

// All routes require admin authentication
router.use(AdminAuthMiddleware);

// ========== VIEW ROUTES (WITH AUDIT - SECURITY SENSITIVE) ==========

/**
 * @route   GET /api/admin/audit 
 * @desc    Get audit logs with filters
 * @access  Private (Admin)
 * @audit   Logs who viewed audit logs (security sensitive)
 */
router.get(
  '/', 
  AuditLog('ADMIN_VIEW_AUDIT_LOGS'), // 👈 ADD AUDIT
  AdminAuditController.getAuditLogs
);
 
/**
 * @route   GET /api/admin/audit/statistics
 * @desc    Get audit statistics
 * @access  Private (Admin)
 * @audit   Logs who viewed audit statistics
 */
router.get(
  '/statistics', 
  AuditLog('ADMIN_VIEW_AUDIT_STATISTICS'), // 👈 ADD AUDIT
  AdminAuditController.getAuditStatistics
);

/**
 * @route   GET /api/admin/audit/:logId
 * @desc    Get single audit log
 * @access  Private (Admin)
 * @audit   Logs who viewed a specific audit log
 */
router.get(
  '/:logId', 
  AuditLog('ADMIN_VIEW_AUDIT_LOG_DETAIL', (req) => req.params.logId as string), // 👈 ADD AUDIT WITH TARGET
  AdminAuditController.getAuditLog
);
router.delete(
  '/:logId',
  AdminAuthMiddleware,
  AdminAuditController.deleteAuditLog
);
export default router;