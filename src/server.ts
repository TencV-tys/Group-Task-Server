import  express  from "express";
import dotenv from "dotenv";
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
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
import { initReminderCron } from "./cron/reminderCron";

dotenv.config(); 

const svr = express();

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

svr.use(cors({
    origin: true,
    credentials: true
}));
svr.use(cookieParser());

// Routes
svr.use('/api/auth/users', UserAuthRoutes);
svr.use('/api/auth/admins', AdminAuthRoutes);
svr.use('/api/group', GroupRoutes);
svr.use('/api/home', HomeRoute);
svr.use('/api/tasks', TaskRoutes);
svr.use('/api/uploads', UploadRoutes); 
svr.use('/api/assignments',AssignmentRoutes);
svr.use('/api/swap-requests', SwapRequestRoutes);
svr.use('/api/notifications', UserNotificationRoutes);
svr.use('/api/feedback', FeedbackRoutes);



svr.get('/reset-password-form', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/reset-password-form.html'));
});
svr.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/forgot-password.html'));
});


initSwapRequestCron();

initReminderCron();

//const COMPUTER_IP = '10.219.65.2';
const MY_IP = '10.116.190.2'; 
const Wifi = '192.168.1.29';
const PORT = process.env.PORT || 5000;

svr.listen(PORT, () => {
    console.log(`
🚀 Server running at http://localhost:${PORT}
📱 http://${MY_IP}:${PORT}
📶 http://${Wifi}:${PORT}

📁 Upload directories created:
   ${path.join(__dirname, '../uploads')}
   ${path.join(__dirname, '../uploads/avatars')}
   ${path.join(__dirname, '../uploads/task-photos')}
     ${path.join(__dirname, '../uploads/group-avatars')}
    `);
});