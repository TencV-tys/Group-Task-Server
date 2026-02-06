// src/utils/multer.ts
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { UserAuthRequest } from '../middlewares/user.auth.middleware';
// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: any) => {
    let folder = 'uploads';
    
    // Determine folder based on upload type
    if (req.body.uploadType === 'avatar') {
      folder = 'uploads/avatars';
    } else if (req.body.uploadType === 'task_photo') {
      folder = 'uploads/task-photos';
    }
    
    const fullPath = path.join(__dirname, '../../', folder);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    
    cb(null, folder);
  },
  filename: (req: UserAuthRequest, file: Express.Multer.File, cb: any) => {
    // Generate unique filename: userId-timestamp.extension
    const userId = req.user?.id || 'anonymous';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const filename = `${userId}-${timestamp}${ext}`;
    cb(null, filename);
  }
});

// File filter
const fileFilter = (req: Request, file: Express.Multer.File, cb: any) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
  }
};

// Configure Multer
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1
  }
});

// Middleware to set upload type from request body
export const setUploadType = (req: Request, res: any, next: any) => {
  req.body.uploadType = req.body.uploadType || 'general';
  next();
};

// Export single file upload middleware
export const singleUpload = upload.single('file');