// src/routes/group.routes.ts
import { Router } from 'express';
import { GroupController } from '../controllers/group.controller';
import { UserAuthMiddleware } from '../middlewares/user.auth.middleware';
import { checkGroupAccess } from '../middlewares/group.status.middleware'; // ✅ ADD THIS
import GroupMemberRoutes from './group.members.routes';

const router = Router();

// All group routes require authentication
router.use(UserAuthMiddleware);

// ============= PUBLIC/GENERAL ROUTES (No group check needed) =============
// These don't require a specific group ID
router.post('/create', GroupController.createGroup);
router.post('/join', GroupController.joinGroup);
router.get('/my-groups', GroupController.getUserGroup);

// ============= GROUP-SPECIFIC ROUTES (Need suspension check) =============
// Apply checkGroupAccess to all routes that access a specific group

// Rotation management routes
router.get('/:groupId/members-with-rotation', checkGroupAccess, GroupController.getGroupMembersWithRotation);
router.put('/:groupId/members/:memberId/rotation', checkGroupAccess, GroupController.updateMemberRotation);
router.post('/:groupId/reorder-rotation', checkGroupAccess, GroupController.reorderRotationSequence);
router.get('/:groupId/rotation-preview', checkGroupAccess, GroupController.getRotationSchedulePreview);

// Group limits routes
router.get('/:groupId/with-limits', checkGroupAccess, GroupController.getGroupWithLimits);
router.put('/:groupId/update-max-members', checkGroupAccess, GroupController.updateMaxMembers);

// ✅ IMPORTANT: Mount group member routes with suspension check applied to ALL sub-routes
// This ensures ALL member operations are blocked for suspended/deleted groups
router.use('/:groupId', checkGroupAccess, GroupMemberRoutes);

export default router;