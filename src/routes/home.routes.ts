import { Router } from "express";
import { HomeController } from "../controllers/home.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";

const router = Router();
router.use(UserAuthMiddleware);

router.get('/', HomeController.getHomeData);
router.get('/weekly-summary', HomeController.getWeeklySummary);
router.get('/dashboard-stats', HomeController.getDashboardStats);

export default router;