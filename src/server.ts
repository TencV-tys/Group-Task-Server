import express from "express";
import dotenv from "dotenv";
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { 
  generalLimiter, 
  authLimiter, 
  uploadLimiter, 
  taskLimiter,
  passwordResetLimiter,
  swapRequestLimiter 
} from './middlewares/rateLimiter';

import UserAuthRoutes from './routes/user.auth.routes';
import AdminAuthRoutes from './routes/admin.auth.routes'; 
import GroupRoutes from './routes/group.routes';
import HomeRoute from './routes/home.routes';
import TaskRoutes from './routes/task.routes';
import UploadRoutes from './routes/upload.routes';
import AssignmentRoutes from './routes/assignment.routes';
import SwapRequestRoutes from './routes/swapRequest.routes';
import { initSwapRequestCron } from "./cron/swapRequest.cron";
import UserNotificationRoutes from './routes/user.notification.routes';
import FeedbackRoutes from './routes/feedback.routes';
import GroupActivityRoutes from './routes/group.activity.routes';
import { initReminderCron } from "./cron/reminderCron";
import { initNeglectDetectionCron } from "./cron/neglectDetection.cron";

dotenv.config(); 

const svr = express();

// ========== RATE LIMITING - APPLY BEFORE ROUTES ==========
console.log('🛡️ Applying rate limiters...');
svr.use('/api', generalLimiter);           // 🛡️ All /api routes
svr.use('/api/auth', authLimiter);         // 🛡️ Auth routes (stricter)
svr.use('/api/uploads', uploadLimiter);    // 🛡️ Upload routes
svr.use('/api/tasks', taskLimiter);        // 🛡️ Task routes
svr.use('/api/swap-requests', swapRequestLimiter); // 🛡️ Swap routes
svr.use('/api/auth/users/reset-password', passwordResetLimiter); // 🛡️ Password reset (strictest)

// ========== CRITICAL UPDATES START ==========

// 1. Serve static files from uploads directory
svr.use('/uploads', express.static(path.join(__dirname, '../uploads')));
svr.use(express.static(path.join(__dirname, '../public')));

// 2. Create uploads directories if they don't exist
const createUploadsDirectories = () => {
  const directories = [
    path.join(__dirname, '../uploads'),
    path.join(__dirname, '../uploads/avatars'),
    path.join(__dirname, '../uploads/group-avatars'), 
    path.join(__dirname, '../uploads/task-photos')
  ];

  directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  });
};

createUploadsDirectories();

// 3. Increase payload size limit for file uploads
svr.use(express.json({ limit: '10mb' })); 
svr.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ========== CRITICAL UPDATES END ==========

// CORS and Cookie Parser
svr.use(cors({
    origin: true,
    credentials: true
}));
svr.use(cookieParser());

// ========== ROUTES ==========
console.log('📡 Registering routes...');
svr.use('/api/auth/users', UserAuthRoutes);
svr.use('/api/auth/admins', AdminAuthRoutes);
svr.use('/api/group', GroupRoutes);
svr.use('/api/home', HomeRoute);
svr.use('/api/tasks', TaskRoutes);
svr.use('/api/uploads', UploadRoutes); 
svr.use('/api/assignments', AssignmentRoutes);
svr.use('/api/swap-requests', SwapRequestRoutes);
svr.use('/api/notifications', UserNotificationRoutes);
svr.use('/api/feedback', FeedbackRoutes);
svr.use('/api/group-activity', GroupActivityRoutes);


// HTML Pages for password reset
svr.get('/reset-password-form', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/reset-password-form.html'));
});

svr.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/forgot-password.html'));
});

// ========== CRON JOBS ==========
console.log('⏰ Initializing cron jobs...');
initSwapRequestCron();
initReminderCron();
initNeglectDetectionCron();

// ========== SERVER START ==========
//const COMPUTER_IP = '10.219.65.2';
const MY_IP = '10.116.190.2'; 
const Wifi = '192.168.1.29';
const PORT = process.env.PORT || 5000;

svr.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                     SERVER STARTED                         ║
╚════════════════════════════════════════════════════════════╝

🚀 Server running at:
   📍 Local:   http://localhost:${PORT}
   📱 Mobile:  http://${MY_IP}:${PORT}
   📶 WiFi:    http://${Wifi}:${PORT}

📁 Upload directories:
   ├─ ${path.join(__dirname, '../uploads')}
   ├─ ${path.join(__dirname, '../uploads/avatars')}
   ├─ ${path.join(__dirname, '../uploads/task-photos')}
   └─ ${path.join(__dirname, '../uploads/group-avatars')}
   
🛡️ RATE LIMITING ENABLED:
   ├─ General API:      100 requests/15min  (all /api routes)
   ├─ Auth routes:      10 requests/hour    (login/register)
   ├─ Upload routes:    20 requests/hour    (file uploads)
   ├─ Task routes:      50 requests/hour    (task operations)
   ├─ Swap requests:    30 requests/hour    (swap operations)
   └─ Password reset:   3 requests/hour     (very strict!)

📡 Routes registered:
   ├─ /api/auth/users
   ├─ /api/auth/admins  
   ├─ /api/group
   ├─ /api/home
   ├─ /api/tasks
   ├─ /api/uploads
   ├─ /api/assignments
   ├─ /api/swap-requests
   ├─ /api/notifications
   └─ /api/feedback

⏰ Cron jobs running:
   ├─ Swap request expiration
   ├─ Task reminders
   └─ Neglect detection

✅ Server is ready to handle requests!
    `);
});