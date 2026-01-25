import { Router } from "express"

import { UserAuthController } from "../controllers/user.auth.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";
const router = Router();


router.post('/login',UserAuthController.login);
router.post('/signup',UserAuthController.signup);
router.post('/refresh-token',UserAuthMiddleware, UserAuthController.refreshToken);
router.post('/logout',UserAuthMiddleware,UserAuthController.logout);

export default router;

