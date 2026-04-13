// src/utils/multer.ts - FIXED VERSION

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

// ✅ FIX: Use 'file' for ALL uploads (consistent with frontend)
export const singleUpload = uploadUserAvatar.single('file');        // User avatar - expects 'file' ✅
export const photoUpload = uploadTaskPhoto.single('file');          // Task photo - expects 'file' ✅
export const groupAvatarUpload = uploadGroupAvatar.single('file');  // Group avatar - expects 'file' ✅

// Default export
export default { singleUpload, photoUpload, groupAvatarUpload };