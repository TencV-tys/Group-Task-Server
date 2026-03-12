// middlewares/rateLimiter.ts
import rateLimit from 'express-rate-limit';

// Strict limiter for authentication routes (prevent brute force)
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Increased from 10 to 50
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

// File upload limiter
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Increased from 20 to 50
  message: {
    success: false,
    message: 'Too many upload attempts, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Task operations limiter
export const taskLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // Increased from 50 to 200
  message: {
    success: false,
    message: 'Too many task operations, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password reset limiter (keep strict)
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Increased from 3 to 5
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Swap request limiter
export const swapRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Increased from 30 to 100
  message: {
    success: false,
    message: 'Too many swap requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Group activity limiter
export const groupActivityLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 300, // Increased from 100 to 300
  message: {
    success: false,
    message: 'Too many activity requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin routes limiter
export const adminLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 500, // Increased from 200 to 500
  message: {
    success: false,
    message: 'Too many admin requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Audit logs limiter
export const auditLogLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 300, // Increased from 100 to 300
  message: {
    success: false,
    message: 'Too many audit log requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Reports limiter
export const reportsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 300, // Increased from 100 to 300
  message: {
    success: false,
    message: 'Too many report requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Feedback limiter
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 300, // Increased from 100 to 300
  message: {
    success: false,
    message: 'Too many feedback requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});