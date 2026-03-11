// routes/report.routes.ts
import { Router } from "express";
import { UserReportController } from "../controllers/user.report.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";

const router = Router();

router.use(UserAuthMiddleware);

router.post('/group', UserReportController.createGroupReport);
router.get('/my-reports', UserReportController.getMyReports);

export default router;