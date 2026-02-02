
import { Router } from "express";
import { TaskController } from "../controllers/task.controller";
import {UserAuthMiddleware} from "../middlewares/user.auth.middleware"; 
const router = Router();

router.use(UserAuthMiddleware);

router.post('/group/:groupId/create', TaskController.createTask);
router.get('/group/:groupId/tasks',TaskController.getGroupTasks);

router.get('/:taskId',TaskController.getTaskDetails);
router.put('/:taskId',TaskController.updateTask);
router.delete('/:taskId',TaskController.deleteTask);

export default router;
