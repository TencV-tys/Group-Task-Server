import { Router } from "express";
import { TaskController } from "../controllers/task.controller";
import { UserAuthMiddleware } from "../middlewares/user.auth.middleware"; 

const router = Router();

// All task routes require authentication
router.use(UserAuthMiddleware);

// ============= GROUP TASK ROUTES =============
// Create task with rotation
router.post('/group/:groupId/create', TaskController.createTask);

// Get all tasks in a group (with optional week parameter)
router.get('/group/:groupId/tasks', TaskController.getGroupTasks);

// Get tasks assigned to current user in a group
router.get('/group/:groupId/my-tasks', TaskController.getMyTasks);

// Rotate tasks for a group (admin only)
router.post('/group/:groupId/rotate', TaskController.rotateTasks);

// Get rotation schedule for a group
router.get('/group/:groupId/schedule', TaskController.getRotationSchedule);

// ============= INDIVIDUAL TASK ROUTES =============
// Get single task details
router.get('/:taskId', TaskController.getTaskDetails);

// Update a task
router.put('/:taskId', TaskController.updateTask);

// Delete a task
router.delete('/:taskId', TaskController.deleteTask);

export default router;