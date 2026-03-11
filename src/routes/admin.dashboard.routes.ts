// routes/admin.dashboard.routes.ts
import { Router } from "express";
import { AdminDashboardController } from "../controllers/admin.dashboard.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";

const router = Router();

// All routes require admin authentication
router.use(AdminAuthMiddleware);

// Get dashboard statistics
router.get('/stats', AdminDashboardController.getStats);

export default router;