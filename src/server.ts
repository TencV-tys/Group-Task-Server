// server.ts - COMPLETE FIXED VERSION (without morgan)
import express from "express";
import dotenv from "dotenv";
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import http from 'http';
import prisma from './prisma';  
import { 
  authLimiter, 
  uploadLimiter, 
  taskLimiter,
  passwordResetLimiter,
  swapRequestLimiter,
  groupActivityLimiter,
  adminLimiter,
  userNotificationLimiter,
  userFeedbackLimiter,
  userReportsLimiter,
  homeLimiter,
  groupLimiter,
  assignmentLimiter
} from './middlewares/rateLimiter';

// ========== ADD CACHE AND THROTTLE IMPORTS ==========
import { cacheMiddleware } from './middlewares/cache.middleware';
import { dbMonitorMiddleware, getDbStats } from './middlewares/db.monitor';
import { 
  throttleMiddleware, 
  strictThrottle, 
  mediumThrottle, 
  lightThrottle,
  heavyThrottle,
  loginThrottle,
  uploadThrottle,
  adminStrictThrottle,
  adminMediumThrottle,
  adminLightThrottle
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

// ============================================================================
// 1. CORS FIRST - BEFORE ANYTHING ELSE
// ============================================================================
console.log('🔓 Configuring CORS...');
svr.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'Accept', 
        'X-Requested-With',
        'cache-control',      // ✅ Add this
        'Cache-Control',      // ✅ Add this (capitalized)
        'x-access-token',
        'X-Access-Token'
    ],
    exposedHeaders: ['Content-Length', 'X-Total-Count', 'X-Request-Id'],
    maxAge: 86400 // 24 hours - cache preflight requests
}));
// ============================================================================
// 2. BASIC MIDDLEWARE - Parsing, Logging
// ============================================================================
console.log('📝 Configuring basic middleware...');

// Body parsing (must be before routes)
svr.use(express.json({ limit: '10mb' })); 
svr.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parsing
svr.use(cookieParser());

// Simple request logging (instead of morgan)
if (process.env.NODE_ENV !== 'production') {
  svr.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.originalUrl}`);
    next();
  });
}

// ============================================================================
// 3. STATIC FILES - Must be before routes
// ============================================================================
console.log('📁 Configuring static files...');
svr.use('/uploads', express.static(path.join(__dirname, '../uploads')));
svr.use(express.static(path.join(__dirname, '../public')));

// ============================================================================
// 4. RATE LIMITERS - Apply early to prevent abuse
// ============================================================================
console.log('🛡️ Applying rate limiters...');

// ===== USER ROUTES (Mobile App) =====
console.log('👤 Configuring user rate limits...');
svr.use('/api/auth/users', authLimiter);
svr.use('/api/auth/users/reset-password', passwordResetLimiter);
svr.use('/api/uploads', uploadLimiter);
svr.use('/api/tasks', taskLimiter);
svr.use('/api/swap-requests', swapRequestLimiter);
svr.use('/api/group', groupLimiter);
svr.use('/api/group-activity', groupActivityLimiter);
svr.use('/api/notifications', userNotificationLimiter);
svr.use('/api/feedback', userFeedbackLimiter);
svr.use('/api/reports', userReportsLimiter);
svr.use('/api/assignments', assignmentLimiter);
svr.use('/api/home', homeLimiter);

// ===== ADMIN ROUTES (Web Dashboard) =====
console.log('👑 Configuring admin rate limits...');
svr.use('/api/admin', adminLimiter);

// ============================================================================
// 5. CACHE MIDDLEWARE - Apply to specific GET endpoints only
// ============================================================================
console.log('💾 Applying cache middleware (GET only)...');

// PUBLIC GET endpoints that are safe to cache
svr.get('/api/home', cacheMiddleware(30 * 1000));
svr.get('/api/group', cacheMiddleware(30 * 1000));
svr.get('/api/tasks', cacheMiddleware(20 * 1000));
svr.get('/api/group-activity', cacheMiddleware(30 * 1000));

// Admin cache endpoints
svr.get('/api/admin/audit/statistics', cacheMiddleware(2 * 60 * 1000));
svr.get('/api/admin/dashboard', cacheMiddleware(3 * 60 * 1000));
svr.get('/api/admin/groups', cacheMiddleware(2 * 60 * 1000));
svr.get('/api/admin/feedback', cacheMiddleware(2 * 60 * 1000));
svr.get('/api/admin/reports', cacheMiddleware(2 * 60 * 1000));
svr.get('/api/admin/users', cacheMiddleware(2 * 60 * 1000));

// ============================================================================
// 6. THROTTLE MIDDLEWARE - Apply after rate limiting
// ============================================================================
console.log('⏱️ Applying throttle middleware...');

// ===== USER THROTTLE (Mobile App) =====
console.log('   👤 User throttles:');

svr.use('/api/auth/users/login', loginThrottle);
svr.use('/api/auth/users/signup', loginThrottle);
svr.use('/api/auth/users/refresh-token', strictThrottle);
svr.use('/api/auth/users/logout', lightThrottle);
svr.use('/api/uploads', uploadThrottle); 
svr.use('/api/tasks', lightThrottle);
svr.use('/api/swap-requests', lightThrottle);
svr.use('/api/feedback', lightThrottle);
svr.use('/api/notifications', lightThrottle);
svr.use('/api/reports', lightThrottle);
svr.use('/api/group', lightThrottle);
svr.use('/api/home', lightThrottle);
svr.use('/api/assignments', lightThrottle);
svr.use('/api/group-activity', lightThrottle);

// ===== ADMIN THROTTLE (Web Dashboard) =====
console.log('   👑 Admin throttles:'); 

svr.use('/api/auth/admins/login', loginThrottle);
svr.use('/api/auth/admins/refresh-token', strictThrottle);
svr.use('/api/admin/audit', throttleMiddleware(10 * 1000, 50));
svr.use('/api/admin/audit/export', throttleMiddleware(60 * 1000, 30));
svr.use('/api/admin/users', throttleMiddleware(10 * 1000, 100));
svr.use('/api/admin/groups', throttleMiddleware(10 * 1000, 100));
svr.use('/api/admin/feedback', throttleMiddleware(10 * 1000, 100));
svr.use('/api/admin/reports', throttleMiddleware(10 * 1000, 100));
svr.use('/api/admin/dashboard', throttleMiddleware(10 * 1000, 100));
svr.use('/api/admin/users/bulk-delete', heavyThrottle);
svr.use('/api/admin/groups/bulk-delete', heavyThrottle);

// ============================================================================
// 7. CREATE UPLOAD DIRECTORIES
// ============================================================================
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

// ============================================================================
// 8. ROUTES - All routes registered here
// ============================================================================
console.log('📡 Registering routes...');

// Auth routes
svr.use('/api/auth/users', UserAuthRoutes);
svr.use('/api/auth/admins', AdminAuthRoutes);

// Main API routes
svr.use('/api/group', GroupRoutes); 
svr.use('/api/home', HomeRoute);
svr.use('/api/tasks', TaskRoutes);
svr.use('/api/uploads', UploadRoutes); 
svr.use('/api/assignments', AssignmentRoutes);
svr.use('/api/swap-requests', SwapRequestRoutes);
svr.use('/api/notifications', UserNotificationRoutes);
svr.use('/api/feedback', FeedbackRoutes);
svr.use('/api/group-activity', GroupActivityRoutes);
svr.use('/api/reports', UserReportRoutes);

// Admin routes
svr.use('/api/admin/users', AdminUsersRoutes);
svr.use('/api/admin/feedback', AdminFeedbackRoutes);
svr.use('/api/admin/notifications', AdminNotificationsRoutes);
svr.use('/api/admin/reports', AdminReportRoutes);
svr.use('/api/admin/audit', AdminAuditRoutes);
svr.use('/api/admin/dashboard', AdminDashboardRoutes);
svr.use('/api/admin/groups', AdminGroupsRoutes); 
svr.use(dbMonitorMiddleware);

svr.get('/api/admin/db-stats', (req, res) => {
  res.json({
    success: true,
    data: getDbStats()
  });
});

// HTML Pages for password reset
svr.get('/reset-password-form', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/reset-password-form.html'));
}); 

svr.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/forgot-password.html'));
});

// Health check endpoint (no auth required)
svr.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler for unmatched routes
svr.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// Global error handler
svr.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Global error handler:', err);
  
  // Handle specific error types
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// ============================================================================
// 9. CREATE HTTP SERVER
// ============================================================================
const server = http.createServer(svr);

// ============================================================================
// 10. INITIALIZE SOCKET.IO
// ============================================================================
console.log('🔌 Initializing Socket.IO...');
const io = setupSocketIO(server);
setIO(io);
console.log('✅ Socket.IO initialized');

// ============================================================================
// 11. SERVER START
// ============================================================================
const MY_IP = process.env.MY_IP || '10.205.101.2'; 
const Wifi = process.env.WIFI_IP || '192.168.1.29';
const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                              SERVER STARTED                                   ║
╚═══════════════════════════════════════════════════════════════════════════════╝

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
   
🛡️ RATE LIMITING ENABLED (3-HOUR WINDOW):
   ├─ Auth routes:          50 requests/3 hours
   ├─ Upload routes:        50 requests/3 hours
   ├─ Task routes:          200 requests/3 hours
   ├─ Swap requests:        100 requests/3 hours
   ├─ Password reset:       5 requests/3 hours
   ├─ Group routes:         300 requests/3 hours
   ├─ Group activity:       300 requests/3 hours
   ├─ Notifications:        200 requests/3 hours
   ├─ User feedback:        100 requests/3 hours
   ├─ User reports:         50 requests/3 hours
   ├─ Assignments:          200 requests/3 hours
   ├─ Home page:            300 requests/3 hours
   ├─ Admin routes:         500 requests/3 hours

💾 CACHE CONFIGURATION (GET only):
   👤 USER (Mobile App):
      ├─ Home data:       30 seconds
      ├─ Group data:      30 seconds  
      ├─ Tasks:           20 seconds
      └─ Activity:        30 seconds
   
   👑 ADMIN (Web Dashboard):
      ├─ Dashboard:       3 minutes
      ├─ Statistics:      2 minutes
      ├─ Users/Groups:    2 minutes
      └─ Reports:         2 minutes

⏱️ THROTTLE CONFIGURATION:
   👤 USER (Mobile App):
      ├─ Login:           5 attempts/15m
      ├─ Upload:          3 per minute
      ├─ General API:     15 requests/10s
      └─ Auth refresh:    3 requests/10s
   
   👑 ADMIN (Web Dashboard):
      ├─ Login:           5 attempts/15m
      ├─ Audit:           50 requests/10s
      ├─ Admin API:       100 requests/10s
      ├─ Export:          30 per minute
      └─ Bulk ops:        30 requests/30s

✅ Server is ready to handle requests from both mobile users and admin dashboard!
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
   ├─ /api/auth/users    (User Auth)
   ├─ /api/auth/admins   (Admin Auth)  
   ├─ /api/group         (Group Management)
   ├─ /api/home          (Home Feed)
   ├─ /api/tasks         (Task Management)
   ├─ /api/uploads       (File Uploads)
   ├─ /api/assignments   (Assignment Management)
   ├─ /api/swap-requests (Swap Requests)
   ├─ /api/notifications (User Notifications)
   ├─ /api/feedback      (User Feedback)
   ├─ /api/reports       (User Reports)
   ├─ /api/admin/*       (Admin Dashboard)

⏰ CRON JOBS SCHEDULE:
   ├─ Swap request expiration: Every 5 minutes
   ├─ Task reminders:         Every hour at :00
   ├─ Neglect detection:      Every 30 minutes
   └─ Task rotation:          Daily at 00:01 AM
    `);
});

// ============================================================================
// 12. GRACEFUL SHUTDOWN
// ============================================================================
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  
  server.close(async () => {
    console.log('📦 HTTP server closed');
    
    if (io) {
      await io.close();
      console.log('🔌 Socket.IO closed');
    }
    
    // Close database connections - use the imported prisma directly
    try {
      await prisma.$disconnect();
      console.log('🗄️ Database disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting database:', error);
    }
    
    console.log('✅ Graceful shutdown complete');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error('⚠️ Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};