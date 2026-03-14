// middlewares/throttle.middleware.ts - OPTIMIZED FOR MOBILE
import { Request, Response, NextFunction } from 'express';

interface ThrottleEntry {
  count: number;
  resetTime: number;
  endpoint: string;
  userId?: string; // Track by user ID when authenticated
}

const throttle = new Map<string, ThrottleEntry>();
const DEFAULT_WINDOW = 10 * 1000; // 10 seconds
const DEFAULT_MAX_REQUESTS = 5; // 5 requests per window

// Clean up old entries every 5 minutes (less frequent for better performance)
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;
  
  for (const [key, entry] of throttle.entries()) {
    if (now > entry.resetTime) {
      throttle.delete(key);
      deletedCount++;
    }
  }
  
  if (deletedCount > 100) { // Only log if significant cleanup
    console.log(`🧹 Cleaned ${deletedCount} expired throttle entries`);
  }
}, 5 * 60 * 1000);

export const throttleMiddleware = (
  windowMs: number = DEFAULT_WINDOW,
  maxRequests: number = DEFAULT_MAX_REQUESTS
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip throttling in development
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    // Use user ID if authenticated, otherwise use IP
    const userId = (req as any).user?.id;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const identifier = userId || ip;
    
    const endpoint = req.baseUrl + req.path;
    const method = req.method;
    const key = `${identifier}:${method}:${endpoint}`;
    const now = Date.now();
    
    const entry = throttle.get(key);
    
    if (!entry || now > entry.resetTime) {
      // New window
      throttle.set(key, {
        count: 1,
        resetTime: now + windowMs,
        endpoint,
        userId
      });
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - 1).toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + windowMs) / 1000).toString());
      
      next();
    } else if (entry.count < maxRequests) {
      // Within limit
      entry.count++;
      throttle.set(key, entry);
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());
      
      next();
    } else {
      // Rate limited
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());
      res.setHeader('Retry-After', retryAfter.toString());
      
      res.status(429).json({
        success: false,
        message: `Too many requests. Please wait ${retryAfter} seconds.`,
        retryAfter,
        limit: maxRequests,
        resetAt: new Date(entry.resetTime).toISOString()
      });
    }
  };
};

// Mobile-optimized throttle configurations
export const strictThrottle = throttleMiddleware(10 * 1000, 3);  // Auth: 3/10s
export const mediumThrottle = throttleMiddleware(10 * 1000, 5);  // Admin: 5/10s
export const lightThrottle = throttleMiddleware(10 * 1000, 15);  // General: 15/10s (increased for mobile)
export const heavyThrottle = throttleMiddleware(30 * 1000, 30);  // Heavy: 30/30s

// Special throttles for critical endpoints
export const loginThrottle = throttleMiddleware(15 * 60 * 1000, 5); // 5 attempts per 15 minutes
export const uploadThrottle = throttleMiddleware(60 * 1000, 3);     // 3 uploads per minute

// Get throttle stats for monitoring (admin only)
export const getThrottleStats = () => ({
  size: throttle.size,
  memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
  entries: Array.from(throttle.entries())
    .sort((a, b) => b[1].resetTime - a[1].resetTime)
    .slice(0, 100) // Only return top 100 for performance
    .map(([key, entry]) => ({
      key: key.substring(0, 50), // Truncate long keys
      count: entry.count,
      resetIn: Math.max(0, entry.resetTime - Date.now()),
      endpoint: entry.endpoint,
      hasUserId: !!entry.userId
    }))
});


// Admin-specific throttles (higher limits)
export const adminStrictThrottle = throttleMiddleware(10 * 1000, 8);  // 8 requests per 10s
export const adminMediumThrottle = throttleMiddleware(10 * 1000, 15); // 15 requests per 10s
export const adminLightThrottle = throttleMiddleware(10 * 1000, 25);  // 25 requests per 10s