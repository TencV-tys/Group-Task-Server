import { Router } from "express";

const router = Router();

import { HomeController } from "../controllers/home.controller";

router.get('/user-data',HomeController.getHomeData);

export default router;