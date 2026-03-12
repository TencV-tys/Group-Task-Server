// middlewares/throttle.middleware.ts
import { Request, Response, NextFunction } from 'express';

interface ThrottleEntry {
  count: number;
  resetTime: number;
  endpoint: string;
}

const throttle = new Map<string, ThrottleEntry>();
const DEFAULT_WINDOW = 10 * 1000; // 10 seconds
const DEFAULT_MAX_REQUESTS = 5; // 5 requests per window

// Clean up old entries every minute
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;
  
  for (const [key, entry] of throttle.entries()) {
    if (now > entry.resetTime) {
      throttle.delete(key);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    console.log(`🧹 Cleaned ${deletedCount} expired throttle entries`);
  }
}, 60 * 1000);

export const throttleMiddleware = (
  windowMs: number = DEFAULT_WINDOW,
  maxRequests: number = DEFAULT_MAX_REQUESTS
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip throttling in development
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const endpoint = req.baseUrl + req.path;
    const key = `${ip}:${endpoint}`;
    const now = Date.now();
    
    const entry = throttle.get(key);
    
    if (!entry || now > entry.resetTime) {
      // New window
      throttle.set(key, {
        count: 1,
        resetTime: now + windowMs,
        endpoint
      });
      next();
    } else if (entry.count < maxRequests) {
      // Within limit
      entry.count++;
      throttle.set(key, entry);
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
        retryAfter
      });
    }
  };
};

// Per-endpoint throttle configurations
export const strictThrottle = throttleMiddleware(10 * 1000, 3); // 3 requests per 10 seconds
export const mediumThrottle = throttleMiddleware(10 * 1000, 5); // 5 requests per 10 seconds
export const lightThrottle = throttleMiddleware(10 * 1000, 10); // 10 requests per 10 seconds
export const heavyThrottle = throttleMiddleware(30 * 1000, 20); // 20 requests per 30 seconds

// Get throttle stats for monitoring
export const getThrottleStats = () => ({
  size: throttle.size,
  entries: Array.from(throttle.entries()).map(([key, entry]) => ({
    key,
    count: entry.count,
    resetIn: Math.max(0, entry.resetTime - Date.now()),
    endpoint: entry.endpoint
  }))
});