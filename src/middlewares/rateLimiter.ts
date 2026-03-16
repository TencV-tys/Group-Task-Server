// middlewares/rateLimiter.ts
import rateLimit from 'express-rate-limit';

// 3 hours in milliseconds
const THREE_HOURS = 60 * 60 * 3000; // 10,800,000 ms = 3 hours

// Strict limiter for authentication routes
export const authLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 50,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// File upload limiter
export const uploadLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 50,
  message: {
    success: false,
    message: 'Too many upload attempts, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Task operations limiter
export const taskLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 200,
  message: {
    success: false,
    message: 'Too many task operations, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password reset limiter (keep strict)
export const passwordResetLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 5,
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Swap request limiter
export const swapRequestLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 100,
  message: {
    success: false,
    message: 'Too many swap requests, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Group activity limiter
export const groupActivityLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 300,
  message: {
    success: false,
    message: 'Too many activity requests, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Group routes limiter
export const groupLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 300,
  message: {
    success: false,
    message: 'Too many group requests, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// User notifications limiter
export const userNotificationLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 200,
  message: {
    success: false,
    message: 'Too many notification requests, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// User feedback limiter
export const userFeedbackLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 100,
  message: {
    success: false,
    message: 'Too many feedback submissions, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// User reports limiter
export const userReportsLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 50,
  message: {
    success: false,
    message: 'Too many report submissions, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Home page data limiter
export const homeLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 300,
  message: {
    success: false,
    message: 'Too many requests, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Assignment operations limiter
export const assignmentLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 200,
  message: {
    success: false,
    message: 'Too many assignment operations, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin routes limiter
// Admin routes limiter with CORS headers
export const adminLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 500,
  message: {
    success: false,
    message: 'Too many admin requests, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    // Always set CORS headers even on rate limit error
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control');
    }
    
    // Send the rate limit error response
    res.status(options.statusCode).json(options.message);
  },
  skipSuccessfulRequests: true, // Don't count successful requests
});

// Keep these for backward compatibility if needed
export const auditLogLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 300,
  message: {
    success: false,
    message: 'Too many audit log requests, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const reportsLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 300,
  message: {
    success: false,
    message: 'Too many report requests, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const feedbackLimiter = rateLimit({
  windowMs: THREE_HOURS,
  max: 300,
  message: {
    success: false,
    message: 'Too many feedback requests, please try again after 3 hours'
  },
  standardHeaders: true,
  legacyHeaders: false,
});