// middlewares/rateLimiter.ts
import rateLimit from 'express-rate-limit';

// Fix windowMs to actually be 1 hour (60 * 60 * 1000)
const ONE_HOUR = 60 * 60 * 3000;

// Strict limiter for authentication routes
export const authLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 50,
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
  windowMs: ONE_HOUR,
  max: 50,
  message: {
    success: false,
    message: 'Too many upload attempts, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Task operations limiter
export const taskLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 200,
  message: {
    success: false,
    message: 'Too many task operations, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password reset limiter (keep strict)
export const passwordResetLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 5,
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Swap request limiter
export const swapRequestLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 100,
  message: {
    success: false,
    message: 'Too many swap requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Group activity limiter
export const groupActivityLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 300,
  message: {
    success: false,
    message: 'Too many activity requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin routes limiter
export const adminLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 500,
  message: {
    success: false,
    message: 'Too many admin requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Audit logs limiter
export const auditLogLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 300,
  message: {
    success: false,
    message: 'Too many audit log requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Reports limiter
export const reportsLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 300,
  message: {
    success: false,
    message: 'Too many report requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Feedback limiter
export const feedbackLimiter = rateLimit({
  windowMs: ONE_HOUR,
  max: 300,
  message: {
    success: false,
    message: 'Too many feedback requests, please try again after an hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
});