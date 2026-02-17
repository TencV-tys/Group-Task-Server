import { Router } from "express"
import { UserAuthController } from "../controllers/user.auth.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";
import { UserPasswordResetController } from "../controllers/user.passwordreset.controller"; 

const router = Router();

// Auth routes
router.post('/login', UserAuthController.login);
router.post('/signup', UserAuthController.signup);
router.post('/refresh-token', UserAuthMiddleware, UserAuthController.refreshToken);
router.post('/logout', UserAuthMiddleware, UserAuthController.logout);

// Password reset routes
router.post('/forgot-password', UserPasswordResetController.requestReset);
router.post('/verify-reset-token', UserPasswordResetController.verifyToken);
router.post('/reset-password', UserPasswordResetController.resetPassword);

export default router;