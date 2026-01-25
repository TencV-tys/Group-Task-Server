import { Router } from "express";
import { AdminAuthController } from "../controllers/admin.auth.controller";
const router = Router();

router.post('/login',AdminAuthController.login);
router.post('/refresh-token', AdminAuthController.refreshToken);
router.post('/logout', AdminAuthController.logout);

export default router;

