import { Router } from "express";
import { AdminAuthController } from "../controllers/admin.auth.controller";
const router = Router();

router.post('/login',AdminAuthController.login);

export default router;

