// src/routes/upload.routes.ts - ADD PUBLIC ROUTE

import { UserAuthMiddleware } from './../middlewares/user.auth.middleware';
import express from 'express';
import { UploadController } from '../controllers/upload.controller';
import { singleUpload, photoUpload, groupAvatarUpload } from '../utils/multer';

const router = express.Router();

// ✅ PUBLIC ROUTE - No authentication (for signup)
router.post(
  '/avatar/cloudinary',
  singleUpload,
  UploadController.uploadAvatarCloudinaryPublic
);

// Protected routes (require authentication)
router.post(
  '/avatar',
  UserAuthMiddleware,
  singleUpload,
  UploadController.uploadAvatarCloudinary
);

// Group avatar upload (Cloudinary)
router.post(
  '/group/:groupId/avatar',
  UserAuthMiddleware,
  groupAvatarUpload,
  UploadController.uploadGroupAvatarCloudinary
);

// Task photo upload (Cloudinary)
router.post(
  '/task-photo',
  UserAuthMiddleware,
  photoUpload,
  UploadController.uploadTaskPhotoCloudinary
);

// Keep base64 endpoints for fallback
router.post('/avatar/base64', UserAuthMiddleware, UploadController.uploadAvatarBase64);
router.post('/group/:groupId/avatar/base64', UserAuthMiddleware, UploadController.uploadGroupAvatarBase64);

// Delete endpoints
router.delete('/avatar', UserAuthMiddleware, UploadController.deleteAvatar);
router.delete('/group/:groupId/avatar', UserAuthMiddleware, UploadController.deleteGroupAvatar);

export default router;