// src/routes/group.routes.ts
import { Router } from 'express';
import { GroupController } from '../controllers/group.controller';
import { UserAuthMiddleware } from '../middlewares/user.auth.middleware';
import GroupMemberRoutes from './group.members.routes';

const router = Router();

// All group routes require authentication
router.use(UserAuthMiddleware);

// Main group routes - These come FIRST
router.post('/create', GroupController.createGroup);
router.post('/join', GroupController.joinGroup);
router.get('/my-groups', GroupController.getUserGroup);

// NEW: Rotation management routes
router.get('/:groupId/members-with-rotation', GroupController.getGroupMembersWithRotation);
router.put('/:groupId/members/:memberId/rotation', GroupController.updateMemberRotation);
router.post('/:groupId/reorder-rotation', GroupController.reorderRotationSequence);
router.get('/:groupId/rotation-preview', GroupController.getRotationSchedulePreview);
// NEW: Get group with member limits
router.get('/:groupId/with-limits', GroupController.getGroupWithLimits);

// NEW: Update max members (admin only)
router.put('/:groupId/update-max-members', GroupController.updateMaxMembers);

// Mount group member routes under /:groupId
// This must come AFTER the main routes to avoid conflicts
router.use('/:groupId', GroupMemberRoutes);

export default router; 