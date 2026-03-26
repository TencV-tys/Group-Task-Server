// middlewares/throttle.middleware.ts - MOBILE OPTIMIZED

import { Request, Response, NextFunction } from 'express';

interface ThrottleEntry {
  count: number;
  resetTime: number;
  endpoint: string;
  userId?: string;
}

const throttle = new Map<string, ThrottleEntry>();
const DEFAULT_WINDOW = 10 * 1000; // 10 seconds
const DEFAULT_MAX_REQUESTS = 15; // ✅ Increased for mobile (more network calls)

// Clean up old entries every 2 minutes (faster cleanup for mobile)
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;
  
  for (const [key, entry] of throttle.entries()) {
    if (now > entry.resetTime) {
      throttle.delete(key);
      deletedCount++;
    }
  }
  
  // ✅ Limit throttle map size for mobile memory
  if (throttle.size > 200) {
    const entriesToDelete = throttle.size - 200;
    const oldestEntries = Array.from(throttle.entries())
      .sort((a, b) => a[1].resetTime - b[1].resetTime)
      .slice(0, entriesToDelete);
    
    oldestEntries.forEach(([key]) => throttle.delete(key));
    deletedCount += oldestEntries.length;
  }
  
  if (deletedCount > 0) {
    console.log(`🧹 Cleaned ${deletedCount} expired throttle entries`);
  }
}, 2 * 60 * 1000); // Every 2 minutes

// Helper function to set CORS headers (important for mobile)
const setCORSHeaders = (req: Request, res: Response) => {
  const origin = req.headers.origin;
  // ✅ Allow all origins for mobile, but allow credentials
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, X-Requested-With, Accept, X-Device-ID');
  res.setHeader('Access-Control-Expose-Headers', 'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
};

export const throttleMiddleware = (
  windowMs: number = DEFAULT_WINDOW,
  maxRequests: number = DEFAULT_MAX_REQUESTS
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // ALWAYS set CORS headers first
    setCORSHeaders(req, res);

    // Handle preflight OPTIONS requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Skip throttling in development
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    // Use user ID if authenticated, otherwise use device ID or IP
    const userId = (req as any).user?.id;
    const deviceId = req.headers['x-device-id'] as string;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const identifier = userId || deviceId || ip;
    
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
export const strictThrottle = throttleMiddleware(10 * 1000, 5);    // Auth: 5/10s
export const mediumThrottle = throttleMiddleware(10 * 1000, 10);   // Admin: 10/10s
export const lightThrottle = throttleMiddleware(10 * 1000, 25);    // General: 25/10s (increased for mobile)
export const heavyThrottle = throttleMiddleware(30 * 1000, 50);     // Heavy: 50/30s

// Special throttles for critical endpoints
export const loginThrottle = throttleMiddleware(15 * 60 * 1000, 5); // 5 attempts per 15 minutes
export const uploadThrottle = throttleMiddleware(60 * 1000, 5);     // 5 uploads per minute (increased)

// Admin-specific throttles
export const adminStrictThrottle = throttleMiddleware(10 * 1000, 15);  // 15 requests per 10s
export const adminMediumThrottle = throttleMiddleware(10 * 1000, 25); // 25 requests per 10s
export const adminLightThrottle = throttleMiddleware(10 * 1000, 40);  // 40 requests per 10s

// Get throttle stats for monitoring
export const getThrottleStats = () => ({
  size: throttle.size,
  memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
  entries: Array.from(throttle.entries())
    .sort((a, b) => b[1].resetTime - a[1].resetTime)
    .slice(0, 50) // Only return top 50 for mobile
    .map(([key, entry]) => ({
      key: key.substring(0, 50),
      count: entry.count,
      resetIn: Math.max(0, entry.resetTime - Date.now()),
      endpoint: entry.endpoint,
      hasUserId: !!entry.userId
    }))
});