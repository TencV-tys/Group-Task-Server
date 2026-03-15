import { Router } from "express";
import { AdminUsersController } from "../controllers/admin.users.controller";
import { AdminAuthMiddleware } from "../middlewares/admin.auth.middleware";

const router = Router();

// All routes require admin authentication
router.use(AdminAuthMiddleware);

// ========== USER MANAGEMENT ROUTES ==========
// Get user statistics
router.get('/stats', AdminUsersController.getUserStats);

// Get all users with filters
router.get('/', AdminUsersController.getUsers);

// Get single user details for modal
router.get('/:userId', AdminUsersController.getUserById);

export default router;