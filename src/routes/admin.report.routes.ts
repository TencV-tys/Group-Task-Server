// routes/admin.report.routes.ts
import { Router } from "express";
import { AdminReportController } from "../controllers/admin.report.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";

const router = Router();

// All admin report routes require admin authentication
router.use(AdminAuthMiddleware);

// Get all reports (with filters)
router.get('/', AdminReportController.getAllReports);

// Get report statistics
router.get('/statistics', AdminReportController.getReportStatistics);

// Get single report details
router.get('/:reportId', AdminReportController.getReportDetails);

// Update report status
router.put('/:reportId/status', AdminReportController.updateReportStatus);

// Bulk update reports
router.post('/bulk-update', AdminReportController.bulkUpdateReports);

export default router;