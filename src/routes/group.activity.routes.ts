import { Router } from 'express';
import { GroupActivityController } from '../controllers/group.activity.controller';
import { UserAuthMiddleware } from '../middlewares/user.auth.middleware';

const router = Router();

// All routes require authentication
router.use(UserAuthMiddleware); 

// Get group activity summary (Admin only)
router.get('/:groupId/summary', GroupActivityController.getActivitySummary);

// Get completion history (All members)
router.get('/:groupId/completion-history', GroupActivityController.getCompletionHistory);

// Get member contribution details
router.get('/:groupId/members/:memberId/contributions', GroupActivityController.getMemberContributions);

// Get task completion history
router.get('/:groupId/tasks/completion-history', GroupActivityController.getTaskCompletionHistory);

// ===== NEW: Dashboard endpoints =====
// Get admin dashboard data
router.get('/:groupId/admin-dashboard', GroupActivityController.getAdminDashboard);

// Get member dashboard data
router.get('/:groupId/member-dashboard', GroupActivityController.getMemberDashboard);

// Get recent activity for dashboard
router.get('/:groupId/recent-activity', GroupActivityController.getRecentActivity);

router.get('/:groupId/leaderboard', GroupActivityController.getLeaderboard);

export default router;