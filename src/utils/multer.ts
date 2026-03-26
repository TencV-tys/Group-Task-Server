// src/utils/multer.ts - FIXED VERSION

import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure storage based on field name (not body.uploadType)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log('📁 Multer - Field name:', file.fieldname);
    
    let uploadPath = '';
    
    // Determine destination based on the field name
    switch (file.fieldname) {
      case 'photo':
        // Assignment photos
        uploadPath = path.join(__dirname, '../../uploads/task-photos');
        break;
      case 'avatar':
      case 'file':
        // User avatar uploads (from profile update)
        uploadPath = path.join(__dirname, '../../uploads/user-avatars');
        break;
      case 'groupAvatar':
        // Group avatar uploads
        uploadPath = path.join(__dirname, '../../uploads/group-avatars');
        break;
      default:
        // Default uploads folder
        uploadPath = path.join(__dirname, '../../uploads');
        console.log('⚠️ Unknown field name:', file.fieldname, 'using default uploads folder');
    }
    
    // Ensure directory exists
    if (!fs.existsSync(uploadPath)) {
      console.log('📁 Creating directory:', uploadPath);
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    console.log('📁 Saving file to:', uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = uniqueSuffix + ext;
    console.log('📁 Filename:', filename);
    console.log('   Original:', file.originalname);
    console.log('   Extension:', ext);
    cb(null, filename);
  }
});

// File filter
const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  console.log('🔍 File filter - field:', file.fieldname, 'mimetype:', file.mimetype);
  
  if (mimetype && extname) { 
    console.log('   ✅ File type accepted');
    return cb(null, true);
  } else {
    console.log('   ❌ File type rejected');
    cb(new Error('Only image files are allowed!'));
  }
};

// Create multer instance
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter
});

// Export different middleware for different field names
export const singleUpload = upload.single('file');    // For 'file' field (avatars)
export const photoUpload = upload.single('photo');    // For 'photo' field (assignments)

export default upload;