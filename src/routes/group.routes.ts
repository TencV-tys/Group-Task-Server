import {Router} from 'express';
import { GroupController } from '../controllers/group.controller';
import { UserAuthMiddleware } from '../middlewares/user.auth.middleware';

const router = Router();

router.use(UserAuthMiddleware);

router.post('/create',GroupController.createGroup);
router.post('/join',GroupController.joinGroup);

export default router;