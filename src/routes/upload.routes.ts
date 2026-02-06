import { UserAuthMiddleware } from './../middlewares/user.auth.middleware';
import express from 'express';
import { UploadController } from '../controllers/upload.controller';
import { singleUpload } from '../utils/multer';

const router = express.Router();

// Avatar upload (file upload)
router.post(
  '/avatar',
  UserAuthMiddleware,
  (req, res, next) => {
    // Set upload type in body
    req.body.uploadType = 'avatar';
    next();
  },
  singleUpload,
  UploadController.uploadAvatar
);

// Avatar upload (base64)
router.post(
  '/avatar/base64',
  UserAuthMiddleware,
  UploadController.uploadAvatarBase64
);

// Task photo upload (file upload)
router.post(
  '/task/:taskId/photo',
  UserAuthMiddleware,
  (req, res, next) => {
    req.body.uploadType = 'task_photo';
    next();
  },
  singleUpload,
  UploadController.uploadTaskPhoto
);

// Delete avatar
router.delete(
  '/avatar',
  UserAuthMiddleware,
  UploadController.deleteAvatar
);

router.post(
  '/group/:groupId/avatar',
  UserAuthMiddleware,
  (req, res, next) => {
    req.body.uploadType = 'avatar';
    next();
  },
  singleUpload,
  UploadController.uploadGroupAvatar
);
 
// Group avatar upload (base64)
router.post(
  '/group/:groupId/avatar/base64',
  UserAuthMiddleware,
  UploadController.uploadGroupAvatarBase64
);


export default router;