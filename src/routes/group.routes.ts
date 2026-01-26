import {Router} from 'express';
import { GroupController } from '../controllers/group.controller';
import { UserAuthMiddleware } from '../middlewares/user.auth.middleware';

const router = Router();

router.use(UserAuthMiddleware);

router.post('/create',GroupController.createGroup);

export default router;