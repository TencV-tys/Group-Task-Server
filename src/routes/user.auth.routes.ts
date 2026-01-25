import { Router } from "express"

import { UserAuthController } from "../controllers/user.auth.controller";

const router = Router();


router.post('/login',UserAuthController.login);
router.post('/signup',UserAuthController.signup);
router.post('/refresh-token', UserAuthController.refreshToken);
router.post('/logout',UserAuthController.logout);

export default router;

