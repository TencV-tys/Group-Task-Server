import { Router } from "express";
import { AdminAuthController } from "../controllers/admin.auth.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";
const router = Router();


router.post('/login',AdminAuthController.login);
router.post('/refresh-token',AdminAuthMiddleware, AdminAuthController.refreshToken);
router.post('/logout',AdminAuthMiddleware, AdminAuthController.logout);

export default router;

