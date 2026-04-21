// routes/admin.report.routes.ts - ADD AUDIT
import { Router } from "express";
import { AdminReportController } from "../controllers/admin.report.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";
import { AuditLog } from "../middlewares/admin.audit.middleware"; // 👈 ADD

const router = Router(); 

router.use(AdminAuthMiddleware);

// View routes (NO AUDIT)
router.get('/', AdminReportController.getAllReports);
router.get('/statistics', AdminReportController.getReportStatistics);
router.get('/:reportId', AdminReportController.getReportDetails);

// Modify routes (WITH AUDIT)
router.put(
  '/:reportId/status', 
  AuditLog('UPDATE_REPORT_STATUS', (req) => req.params.reportId as string), // 👈 ADD AUDIT
  AdminReportController.updateReportStatus
);

router.delete(
  '/:reportId',
  AuditLog('DELETE_REPORT', (req) => req.params.reportId as string),
  AdminReportController.deleteReport
);

router.post(
  '/bulk-delete',
  AuditLog('BULK_DELETE_REPORTS'),
  AdminReportController.bulkDeleteReports
);
router.post(
  '/bulk-update', 
  AuditLog('BULK_UPDATE_REPORTS'), // 👈 ADD AUDIT
  AdminReportController.bulkUpdateReports
);

export default router;