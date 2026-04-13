// src/utils/multer.ts - CLOUDINARY VERSION

import multer from 'multer';
import { uploadUserAvatar, uploadGroupAvatar, uploadTaskPhoto } from '../config/cloudinary.config';

// File filter for images
const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

// Cloudinary upload instances
export const singleUpload = uploadUserAvatar.single('file');     // For user avatar
export const photoUpload = uploadTaskPhoto.single('photo');      // For task photos

// Group avatar upload
export const groupAvatarUpload = uploadGroupAvatar.single('groupAvatar');

// Default export
export default { singleUpload, photoUpload, groupAvatarUpload };