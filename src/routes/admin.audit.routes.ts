// routes/admin.audit.routes.ts
import { Router } from "express";
import { AdminAuditController } from "../controllers/admin.audit.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";

const router = Router();

// All routes require admin authentication
router.use(AdminAuthMiddleware);

// Get audit logs with filters
router.get('/', AdminAuditController.getAuditLogs);

// Get audit statistics
router.get('/statistics', AdminAuditController.getAuditStatistics);

// Get single audit log
router.get('/:logId', AdminAuditController.getAuditLog);

export default router;