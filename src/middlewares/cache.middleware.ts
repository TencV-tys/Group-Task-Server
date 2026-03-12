// middlewares/cache.middleware.ts
import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Clean up old cache entries every 10 minutes
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
}, 10 * 60 * 1000);

export const cacheMiddleware = (duration: number = DEFAULT_CACHE_TTL) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const key = `${req.originalUrl}|${JSON.stringify(req.query)}`;
    const cached = cache.get(key);
    
    // Return cached response if valid
    if (cached && Date.now() - cached.timestamp < duration) {
      console.log(`✅ Cache hit: ${req.originalUrl}`);
      return res.json(cached.data);
    }
    
    console.log(`❌ Cache miss: ${req.originalUrl}`);
    
    // Store original json method
    const originalJson = res.json;
    
    // Override json to cache response
    res.json = function(body) {
      // Only cache successful responses
      if (body && body.success === true) {
        cache.set(key, {
          data: body,
          timestamp: Date.now()
        });
      }
      
      return originalJson.call(this, body);
    };
    
    next();
  };
};

// Helper to clear cache for specific patterns
export const clearCache = (pattern?: RegExp) => {
  if (!pattern) {
    cache.clear();
    console.log('🧹 Cleared entire cache');
    return;
  }
  
  let deletedCount = 0;
  for (const key of cache.keys()) {
    if (pattern.test(key)) {
      cache.delete(key);
      deletedCount++;
    }
  }
  
  console.log(`🧹 Cleared ${deletedCount} cache entries matching pattern`);
};

// Export cache stats for monitoring
export const getCacheStats = () => ({
  size: cache.size,
  keys: Array.from(cache.keys())
});