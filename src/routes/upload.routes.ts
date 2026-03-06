import { UserAuthMiddleware } from './../middlewares/user.auth.middleware';
import express from 'express';
import { UploadController } from '../controllers/upload.controller';
import { singleUpload, photoUpload } from '../utils/multer'; // Import both

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
  singleUpload, // Uses 'file' field
  UploadController.uploadAvatar
);

// Avatar upload (base64)
router.post(
  '/avatar/base64',
  UserAuthMiddleware,
  UploadController.uploadAvatarBase64
);

// Task photo upload (file upload) - FOR ASSIGNMENTS
router.post(
  '/task/:taskId/photo',
  UserAuthMiddleware,
  (req, res, next) => {
    req.body.uploadType = 'task_photo';
    next();
  },
  photoUpload, // Uses 'photo' field for assignments
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
    req.body.uploadType = 'group_avatar';
    next();
  },
  singleUpload, // Uses 'file' field
  UploadController.uploadGroupAvatar
);
 
// Group avatar upload (base64)
router.post(
  '/group/:groupId/avatar/base64',
  UserAuthMiddleware,
  UploadController.uploadGroupAvatarBase64
);

router.delete(
  '/group/:groupId/avatar',
  UserAuthMiddleware,
  UploadController.deleteGroupAvatar
);

// Remove duplicate route at the bottom

export default router;