// src/utils/multer.ts
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure storage based on upload type
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadType = req.body.uploadType;
    
    let uploadPath = '';
    switch (uploadType) {
      case 'user_avatar':
        uploadPath = path.join(__dirname, '../../uploads/user-avatars');
        break;
      case 'group_avatar':
        uploadPath = path.join(__dirname, '../../uploads/group-avatars');
        break;
      case 'task_photo':
        uploadPath = path.join(__dirname, '../../uploads/task-photos');
        break;
      default:
        uploadPath = path.join(__dirname, '../../uploads');
    }
    
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (mimetype && extname) { 
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

export const singleUpload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
}).single('file');