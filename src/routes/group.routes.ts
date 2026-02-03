import {Router} from 'express';
import { GroupController } from '../controllers/group.controller';
import { UserAuthMiddleware } from '../middlewares/user.auth.middleware';
import GroupMemberRoutes from './group.members.routes';

const router = Router();

router.use(UserAuthMiddleware);
router.use('/',GroupMemberRoutes);

router.post('/create',GroupController.createGroup);
router.post('/join',GroupController.joinGroup);
router.get('/my-groups',GroupController.getUserGroup);

export default router; 