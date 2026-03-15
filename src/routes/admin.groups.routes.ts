// routes/admin.groups.routes.ts - CLEANED UP
import { Router } from "express";
import { AdminGroupsController } from "../controllers/admin.groups.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";

const router = Router();

router.use(AdminAuthMiddleware);

// ========== VIEW ROUTES ==========
router.get('/', AdminGroupsController.getGroups);
router.get('/with-analysis', AdminGroupsController.getGroupsWithAnalysis);
router.get('/statistics', AdminGroupsController.getGroupStatistics);
router.get('/:groupId', AdminGroupsController.getGroupById);

// ========== REPORT ANALYSIS ROUTES ==========
router.get('/:groupId/reports/analyze', AdminGroupsController.analyzeGroupReports);
router.post('/:groupId/apply-action', AdminGroupsController.applyAction);

// ========== MODIFY ROUTES ==========
router.delete('/:groupId', AdminGroupsController.deleteGroup);

export default router;