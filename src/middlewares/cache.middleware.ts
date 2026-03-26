// middlewares/cache.middleware.ts - FIXED VERSION
import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  data: any;
  timestamp: number;
  etag: string;
  hits: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache stats for monitoring
let cacheHits = 0;
let cacheMisses = 0;

// Clean up old cache entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;
  
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > DEFAULT_CACHE_TTL) {
      cache.delete(key);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    console.log(`🧹 Cleaned ${deletedCount} expired cache entries`);
  }
}, 15 * 60 * 1000);

// Generate ETag for response data
const generateETag = (data: any): string => {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
};

// ✅ List of routes that should NEVER be cached
const NEVER_CACHE_PATTERNS = [
  '/api/assignments',      // Assignment operations
  '/api/swap-requests',    // Swap operations  
  '/api/tasks',            // Task operations
  '/api/group',            // Group operations
  '/api/notifications',    // Notifications
  '/api/feedback',         // Feedback
  '/api/reports',          // Reports
  '/api/uploads',          // Uploads
  '/api/auth',             // Auth endpoints
];

const shouldNeverCache = (url: string): boolean => {
  return NEVER_CACHE_PATTERNS.some(pattern => url.includes(pattern));
};

export const cacheMiddleware = (duration: number = DEFAULT_CACHE_TTL) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // ✅ Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    // ✅ Check if URL should never be cached
    if (shouldNeverCache(req.originalUrl)) {
      console.log(`🚫 Skipping cache for non-cacheable route: ${req.originalUrl}`);
      return next();
    }
    
    // Check if request is for authenticated user
    const hasAuthHeader = req.headers.authorization;
    const hasAuthCookie = req.cookies?.accessToken;
    const isAuthenticated = hasAuthHeader || hasAuthCookie;
    
    // ✅ DON'T CACHE authenticated requests (personalized data)
    if (isAuthenticated) {
      console.log(`🚫 Skipping cache for authenticated request: ${req.originalUrl}`);
      // Set no-cache headers for authenticated requests
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      return next();
    }

    // For public endpoints, use cache
    const key = `${req.originalUrl.split('?')[0]}|${JSON.stringify(req.query)}`;
    const cached = cache.get(key);
    
    const ifNoneMatch = req.headers['if-none-match'];
    
    if (cached) {
      cacheMisses++;
      
      if (ifNoneMatch === cached.etag) {
        cacheHits++;
        console.log(`✅ Cache 304: ${req.originalUrl}`);
        return res.status(304).send();
      }
      
      if (Date.now() - cached.timestamp < duration) {
        cacheHits++;
        console.log(`✅ Cache hit: ${req.originalUrl}`);
        
        cached.hits++;
        cache.set(key, cached);
        
        res.setHeader('Cache-Control', `public, max-age=${Math.floor(duration / 1000)}`);
        res.setHeader('ETag', cached.etag);
        res.setHeader('X-Cache', 'HIT');
        
        return res.json(cached.data);
      }
      
      cache.delete(key);
    }
    
    cacheMisses++;
    console.log(`❌ Cache miss: ${req.originalUrl}`);
    
    // ✅ Store original json method
    const originalJson = res.json;
    let responseSent = false;
    
    // ✅ Override json method to capture response
    res.json = function(body) {
      if (responseSent) {
        return originalJson.call(this, body);
      }
      responseSent = true;
      
      // ✅ Only cache successful public responses
      if (body && body.success === true && !isAuthenticated) {
        const etag = generateETag(body);
        
        cache.set(key, {
          data: body,
          timestamp: Date.now(),
          etag,
          hits: 1
        });
        
        res.setHeader('Cache-Control', `public, max-age=${Math.floor(duration / 1000)}`);
        res.setHeader('ETag', etag);
        res.setHeader('X-Cache', 'MISS');
      } else {
        // For authenticated or failed requests, don't cache
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      }
      
      return originalJson.call(this, body);
    };
    
    next();
  };
};

// Helper to clear cache for specific patterns
export const clearCache = (pattern?: RegExp | string) => {
  if (!pattern) {
    cache.clear();
    cacheHits = 0;
    cacheMisses = 0;
    console.log('🧹 Cleared entire cache');
    return;
  }
  
  let deletedCount = 0;
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
  
  for (const key of cache.keys()) {
    if (regex.test(key)) {
      cache.delete(key);
      deletedCount++;
    }
  }
  
  console.log(`🧹 Cleared ${deletedCount} cache entries matching pattern`);
};

export const getCacheStats = () => ({
  size: cache.size,
  hits: cacheHits,
  misses: cacheMisses,
  hitRate: cacheHits + cacheMisses > 0 ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100) : 0
});