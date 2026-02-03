// src/routes/group.routes.ts
import { Router } from 'express';
import { GroupController } from '../controllers/group.controller';
import { UserAuthMiddleware } from '../middlewares/user.auth.middleware';
import GroupMemberRoutes from './group.members.routes';

const router = Router();

// All group routes require authentication
router.use(UserAuthMiddleware);

// Mount group member routes under /:groupId
// This will create routes like: /api/group/:groupId/members
router.use('/:groupId', GroupMemberRoutes);

// Main group routes
router.post('/create', GroupController.createGroup);
router.post('/join', GroupController.joinGroup);
router.get('/my-groups', GroupController.getUserGroup);

// Get group info (add this)
router.get('/:groupId/info', GroupController.getGroupInfo);

export default router;