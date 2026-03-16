// routes/admin.groups.routes.ts - WITH AUDIT LOGGING (SAME FORMAT)

import { Router } from "express";
import { AdminGroupsController } from "../controllers/admin.groups.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";
import { AuditLog } from "../middlewares/admin.audit.middleware";

const router = Router();

// All routes require admin authentication
router.use(AdminAuthMiddleware);

// ========== VIEW ROUTES (NO AUDIT - READ ONLY) ==========
router.get('/', AdminGroupsController.getGroups);
router.get('/with-analysis', AdminGroupsController.getGroupsWithAnalysis);
router.get('/statistics', AdminGroupsController.getGroupStatistics);
router.get('/:groupId', AdminGroupsController.getGroupById);

// ========== REPORT ANALYSIS ROUTES (AUDIT FOR ACTIONS) ==========
router.get('/:groupId/reports/analyze', AdminGroupsController.analyzeGroupReports);
router.post(
  '/:groupId/apply-action', 
  AuditLog('APPLY_GROUP_ACTION', (req) => req.params.groupId as string),
  AdminGroupsController.applyAction
);
 
// ========== MODIFY ROUTES (WITH AUDIT) ==========
router.delete(
  '/:groupId', 
  AuditLog('DELETE_GROUP', (req) => req.params.groupId as string),
  AdminGroupsController.deleteGroup
);

export default router;