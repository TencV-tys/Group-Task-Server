import express from "express";
import dotenv from "dotenv";
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { 
  authLimiter, 
  uploadLimiter, 
  taskLimiter,
  passwordResetLimiter,
  swapRequestLimiter,
  groupActivityLimiter,
  adminLimiter,
  auditLogLimiter,
  reportsLimiter,
  feedbackLimiter
} from './middlewares/rateLimiter';

// ========== ADD CACHE AND THROTTLE IMPORTS ==========
import { cacheMiddleware } from './middlewares/cache.middleware';
import { 
  throttleMiddleware, 
  strictThrottle, 
  mediumThrottle, 
  lightThrottle,
  heavyThrottle
} from './middlewares/throttle.middleware';

import UserAuthRoutes from './routes/user.auth.routes';
import AdminAuthRoutes from './routes/admin.auth.routes'; 
import GroupRoutes from './routes/group.routes';
import HomeRoute from './routes/home.routes';
import TaskRoutes from './routes/task.routes';
import UploadRoutes from './routes/upload.routes';
import AssignmentRoutes from './routes/assignment.routes';
import SwapRequestRoutes from './routes/swapRequest.routes';
import UserNotificationRoutes from './routes/user.notification.routes';
import FeedbackRoutes from './routes/feedback.routes';
import GroupActivityRoutes from './routes/group.activity.routes';
import AdminUsersRoutes from './routes/admin.users.routes';
import AdminFeedbackRoutes from './routes/admin.feedback.routes';
import AdminNotificationsRoutes from './routes/admin.notifications.routes';
import UserReportRoutes from './routes/user.report.routes';
import AdminReportRoutes from './routes/admin.report.routes';
import AdminAuditRoutes from './routes/admin.audit.routes';
import AdminDashboardRoutes from './routes/admin.dashboard.routes';
import AdminGroupsRoutes from './routes/admin.groups.routes';

import { initSwapRequestCron } from "./cron/swapRequest.cron";
import { initReminderCron } from "./cron/reminderCron";
import { initNeglectDetectionCron } from "./cron/neglectDetection.cron";
import { CronService } from './cron/rotateGroupTask.cron';

// ========== ADD THIS IMPORT ==========
import { checkAndFixRotation } from './utils/devRotation';

// Socket.IO imports
import { setupSocketIO, setIO } from './socket';

dotenv.config(); 

const svr = express();

// ========== RATE LIMITING - APPLY BEFORE ROUTES ==========
console.log('🛡️ Applying rate limiters...');

// Auth routes (stricter)
svr.use('/api/auth', authLimiter);

// Upload routes
svr.use('/api/uploads', uploadLimiter);

// Task routes
svr.use('/api/tasks', taskLimiter);

// Swap routes
svr.use('/api/swap-requests', swapRequestLimiter);

// Password reset (strictest)
svr.use('/api/auth/users/reset-password', passwordResetLimiter);

// Group activity
svr.use('/api/group-activity', groupActivityLimiter);

// Admin routes
svr.use('/api/admin', adminLimiter);

// ========== CACHE MIDDLEWARE - FOR READ-ONLY ENDPOINTS ==========
console.log('💾 Applying cache middleware...');
svr.use('/api/admin/audit/statistics', cacheMiddleware(30 * 1000)); // Cache for 30 seconds
svr.use('/api/admin/dashboard', cacheMiddleware(60 * 1000)); // Cache for 1 minute
svr.use('/api/admin/groups', cacheMiddleware(30 * 1000)); // Cache for 30 seconds
svr.use('/api/admin/feedback', cacheMiddleware(30 * 1000)); // Cache for 30 seconds
svr.use('/api/admin/reports', cacheMiddleware(30 * 1000)); // Cache for 30 seconds
svr.use('/api/admin/users', cacheMiddleware(30 * 1000)); // Cache for 30 seconds
svr.use('/api/group', cacheMiddleware(20 * 1000)); // Cache for 20 seconds
svr.use('/api/home', cacheMiddleware(30 * 1000)); // Cache for 30 seconds

// ========== THROTTLE MIDDLEWARE - PREVENT ABUSE ==========
console.log('⏱️ Applying throttle middleware...');
svr.use('/api/admin/audit', mediumThrottle); // 5 requests per 10 seconds
svr.use('/api/admin/audit/export', throttleMiddleware(60 * 1000, 2)); // 2 exports per minute
svr.use('/api/admin/users', lightThrottle); // 10 requests per 10 seconds
svr.use('/api/admin/groups', lightThrottle); // 10 requests per 10 seconds
svr.use('/api/admin/feedback', lightThrottle); // 10 requests per 10 seconds
svr.use('/api/admin/reports', lightThrottle); // 10 requests per 10 seconds
svr.use('/api/auth', strictThrottle); // 3 requests per 10 seconds for auth
svr.use('/api/auth/users/reset-password', strictThrottle); // 3 requests per 10 seconds
svr.use('/api/tasks', lightThrottle); // 10 requests per 10 seconds
svr.use('/api/swap-requests', lightThrottle); // 10 requests per 10 seconds
svr.use('/api/feedback', lightThrottle); // 10 requests per 10 seconds

// Specific admin route limiters (keep these for hourly limits)
svr.use('/api/admin/audit', auditLogLimiter);
svr.use('/api/admin/reports', reportsLimiter);
svr.use('/api/admin/feedback', feedbackLimiter);

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
svr.use('/api/admin/users', AdminUsersRoutes);
svr.use('/api/admin/feedback', AdminFeedbackRoutes);
svr.use('/api/admin/notifications', AdminNotificationsRoutes);
svr.use('/api/reports', UserReportRoutes);
svr.use('/api/admin/reports', AdminReportRoutes);
svr.use('/api/admin/audit', AdminAuditRoutes);
svr.use('/api/admin/dashboard', AdminDashboardRoutes);
svr.use('/api/admin/groups', AdminGroupsRoutes);

// HTML Pages for password reset
svr.get('/reset-password-form', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/reset-password-form.html'));
}); 

svr.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/forgot-password.html'));
});

// ========== CREATE HTTP SERVER ==========
const server = http.createServer(svr);

// ========== INITIALIZE SOCKET.IO ==========
console.log('🔌 Initializing Socket.IO...');
const io = setupSocketIO(server);
setIO(io);
console.log('✅ Socket.IO initialized');

// ========== SERVER START WITH AUTO-ROTATION ==========

const MY_IP = '10.123.17.2'; 
const Wifi = '192.168.1.29';
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║                     SERVER STARTED                         ║
╚════════════════════════════════════════════════════════════╝

🚀 Server running at:
   📍 Local:   http://localhost:${PORT}
   📱 Mobile:  http://${MY_IP}:${PORT}
   📶 WiFi:    http://${Wifi}:${PORT}

🔌 WebSocket Server: Active
   └─ Real-time features enabled

📁 Upload directories:
   ├─ ${path.join(__dirname, '../uploads')}
   ├─ ${path.join(__dirname, '../uploads/avatars')}
   ├─ ${path.join(__dirname, '../uploads/task-photos')}
   └─ ${path.join(__dirname, '../uploads/group-avatars')}
   
🛡️ RATE LIMITING ENABLED:
   ├─ Auth routes:      10 requests/hour    (login/register)
   ├─ Upload routes:    20 requests/hour    (file uploads)
   ├─ Task routes:      50 requests/hour    (task operations)
   ├─ Swap requests:    30 requests/hour    (swap operations)
   ├─ Password reset:   3 requests/hour     (very strict!)
   ├─ Group activity:   100 requests/hour   (activity feeds)
   ├─ Admin routes:     200 requests/hour   (admin operations)
   ├─ Audit logs:       100 requests/hour   (audit log views)
   ├─ Reports:          100 requests/hour   (report views)
   └─ Feedback:         100 requests/hour   (feedback views)

💾 CACHE ENABLED:
   ├─ Statistics:       30 seconds 
   ├─ Dashboard:        60 seconds
   ├─ Groups list:      30 seconds
   ├─ Users list:       30 seconds
   ├─ Feedback list:    30 seconds
   └─ Reports list:     30 seconds

⏱️ THROTTLE ENABLED:
   ├─ Auth:             3 requests/10s
   ├─ Admin pages:      5 requests/10s
   ├─ General API:      10 requests/10s
   └─ Exports:          2 requests/minute
    `);

    // ===== DEVELOPMENT AUTO-ROTATION CHECK =====
    if (process.env.NODE_ENV !== 'production') {
        console.log('🧪 Development mode: Checking rotation status...');
        try {
            await checkAndFixRotation();
            console.log('✅ Development rotation check complete');
        } catch (error) {
            console.error('❌ Development rotation check failed:', error);
        }
    }

    // ========== CRON JOBS ==========
    console.log('⏰ Initializing cron jobs...');
    initSwapRequestCron();
    initReminderCron();
    initNeglectDetectionCron();
    CronService.initialize();
    
    console.log(`
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
   └─ Weekly task rotation (Sundays 00:01 AM)

✅ Server is ready to handle requests!
    `);
});

// Add this at the bottom of your server.ts
process.on('SIGINT', async () => {
  console.log('\n📦 Shutting down server...');
  
  // Force process remaining audit logs
  const { getAuditQueueStats, AdminAuditService } = require('./services/admin.audit.services');
  const stats = getAuditQueueStats();
  
  if (stats.queueSize > 0) {
    console.log(`📊 Processing ${stats.queueSize} remaining audit logs...`);
    await AdminAuditService.forceProcessQueue();
  }
  
  console.log('✅ Shutdown complete');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  // Don't exit immediately, let the process continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});