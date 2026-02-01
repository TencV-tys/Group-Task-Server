import { Router } from "express";

const router = Router();

import { HomeController } from "../controllers/home.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware";

router.use(UserAuthMiddleware);

router.get('/',HomeController.getHomeData);

router.get('/stats',HomeController.getHomeData);

export default router;