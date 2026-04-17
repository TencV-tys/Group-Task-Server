// middlewares/rateLimiter.ts
import rateLimit from 'express-rate-limit';

// 1 hour in milliseconds
const ONE = 60 * 60 * 1000; // 10,800,000 ms = 3 hours

// Strict limiter for authentication routes
export const authLimiter = rateLimit({
  windowMs: ONE,
  max: 50,
  message: { 
    success: false,
    message: 'Too many authentication attempts, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// File upload limiter
export const uploadLimiter = rateLimit({
  windowMs: ONE,
  max: 50,
  message: {
    success: false,
    message: 'Too many upload attempts, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Task operations limiter
export const taskLimiter = rateLimit({
  windowMs: ONE,
  max: 500,
  message: {
    success: false,
    message: 'Too many task operations, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password reset limiter (keep strict)
export const passwordResetLimiter = rateLimit({
  windowMs: ONE,
  max: 5,
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Swap request limiter
export const swapRequestLimiter = rateLimit({
  windowMs: ONE,
  max: 500, // bump from 100 to 300
  message: {
    success: false,
    message: 'Too many swap requests, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // ← add this, only count failures
});
// Group activity limiter
export const groupActivityLimiter = rateLimit({
  windowMs: ONE,
  max: 500,
  message: {
    success: false,
    message: 'Too many activity requests, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Group routes limiter
export const groupLimiter = rateLimit({
  windowMs: ONE,
  max: 500,
  message: {
    success: false,
    message: 'Too many group requests, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// User notifications limiter
export const userNotificationLimiter = rateLimit({
  windowMs: ONE,
  max: 300,
  message: {
    success: false,
    message: 'Too many notification requests, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// User feedback limiter
export const userFeedbackLimiter = rateLimit({
  windowMs: ONE,
  max: 500,
  message: {
    success: false,
    message: 'Too many feedback submissions, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// User reports limiter
export const userReportsLimiter = rateLimit({
  windowMs: ONE,
  max: 50,
  message: {
    success: false,
    message: 'Too many report submissions, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Home page data limiter
export const homeLimiter = rateLimit({
  windowMs: ONE,
  max: 500,
  message: {
    success: false,
    message: 'Too many requests, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Assignment operations limiter
export const assignmentLimiter = rateLimit({
  windowMs: ONE,
  max: 500,
  message: {
    success: false,
    message: 'Too many assignment operations, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin routes limiter
// Admin routes limiter with CORS headers
export const adminLimiter = rateLimit({
  windowMs: ONE,
  max: 500,
  message: {
    success: false,
    message: 'Too many admin requests, please try again after 1 hour'
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
  windowMs: ONE,
  max: 500,
  message: {
    success: false,
    message: 'Too many audit log requests, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const reportsLimiter = rateLimit({
  windowMs: ONE,
  max: 500,
  message: {
    success: false,
    message: 'Too many report requests, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const feedbackLimiter = rateLimit({
  windowMs:ONE,
  max: 500,
  message: {
    success: false,
    message: 'Too many feedback requests, please try again after 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});