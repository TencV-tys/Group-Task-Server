// src/config/cloudinary.config.ts
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import dotenv from 'dotenv';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('📸 Cloudinary configured:', {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? '✅' : '❌',
  api_key: process.env.CLOUDINARY_API_KEY ? '✅' : '❌',
  api_secret: process.env.CLOUDINARY_API_SECRET ? '✅' : '❌',
});

// Storage for user avatars
const userAvatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'user-avatars',
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
    transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }],
  } as any,
});

// Storage for group avatars
const groupAvatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'group-avatars',
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill' }],
  } as any,
});

// Storage for task photos
const taskPhotoStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'task-photos',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
  } as any,
});

// Multer instances
export const uploadUserAvatar = multer({ storage: userAvatarStorage, limits: { fileSize: 5 * 1024 * 1024 } });
export const uploadGroupAvatar = multer({ storage: groupAvatarStorage, limits: { fileSize: 5 * 1024 * 1024 } });
export const uploadTaskPhoto = multer({ storage: taskPhotoStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// Helper: Delete from Cloudinary
export const deleteFromCloudinary = async (publicId: string) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw error;
  }
};

// Helper: Extract public ID from Cloudinary URL
export const extractPublicId = (url: string): string | null => {
  if (!url) return null;
  try {
    const parts = url.split('/');
    const filename = parts.pop() || '';
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1) return null;
    const folderParts = parts.slice(uploadIndex + 2);
    const folder = folderParts.join('/');
    return `${folder}/${filename.split('.')[0]}`;
  } catch {
    return null;
  } 
};

export default cloudinary;