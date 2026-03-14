// middlewares/cache.middleware.ts - OPTIMIZED FOR MOBILE
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

// Clean up old cache entries every 15 minutes (less frequent for performance)
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;
  let totalHits = 0;
  
  for (const [key, entry] of cache.entries()) {
    totalHits += entry.hits;
    if (now - entry.timestamp > DEFAULT_CACHE_TTL) {
      cache.delete(key);
      deletedCount++;
    }
  }
  
  if (deletedCount > 50) { // Only log if significant cleanup
    console.log(`🧹 Cleaned ${deletedCount} expired cache entries. Cache hit rate: ${Math.round((cacheHits / (cacheHits + cacheMisses)) * 100)}%`);
  }
}, 15 * 60 * 1000);

// Generate ETag for response data
const generateETag = (data: any): string => {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
};

export const cacheMiddleware = (duration: number = DEFAULT_CACHE_TTL) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Don't cache if user is authenticated (personalized data)
    if ((req as any).user?.id) {
      return next();
    }

    const key = `${req.originalUrl.split('?')[0]}|${JSON.stringify(req.query)}`; // Ignore random params
    const cached = cache.get(key);
    
    // Check if client has valid cached version
    const ifNoneMatch = req.headers['if-none-match'];
    
    if (cached) {
      cacheMisses++;
      
      // Return 304 if ETag matches
      if (ifNoneMatch === cached.etag) {
        cacheHits++;
        console.log(`✅ Cache 304: ${req.originalUrl}`);
        return res.status(304).send();
      }
      
      // Return cached data if still valid
      if (Date.now() - cached.timestamp < duration) {
        cacheHits++;
        console.log(`✅ Cache hit: ${req.originalUrl} (hits: ${cached.hits})`);
        
        // Update hit count
        cached.hits++;
        cache.set(key, cached);
        
        // Add cache headers
        res.setHeader('Cache-Control', `private, max-age=${Math.floor(duration / 1000)}`);
        res.setHeader('ETag', cached.etag);
        res.setHeader('X-Cache', 'HIT');
        
        return res.json(cached.data);
      }
      
      // Cache expired
      cache.delete(key);
    }
    
    cacheMisses++;
    console.log(`❌ Cache miss: ${req.originalUrl}`);
    
    // Store original json method
    const originalJson = res.json;
    
    // Override json to cache response
    res.json = function(body) {
      // Only cache successful responses that aren't too large
      if (body && body.success === true && JSON.stringify(body).length < 100000) { // < 100KB
        const etag = generateETag(body);
        
        cache.set(key, {
          data: body,
          timestamp: Date.now(),
          etag,
          hits: 1
        });
        
        // Add cache headers
        res.setHeader('Cache-Control', `private, max-age=${Math.floor(duration / 1000)}`);
        res.setHeader('ETag', etag);
        res.setHeader('X-Cache', 'MISS');
      } else {
        // No cache for failed or large responses
        res.setHeader('Cache-Control', 'no-store');
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

// Export cache stats for monitoring
export const getCacheStats = () => ({
  size: cache.size,
  memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
  hits: cacheHits,
  misses: cacheMisses,
  hitRate: cacheHits + cacheMisses > 0 ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100) : 0,
  entries: Array.from(cache.entries())
    .sort((a, b) => b[1].hits - a[1].hits)
    .slice(0, 20) // Only top 20 for performance
    .map(([key, entry]) => ({
      key: key.substring(0, 50),
      age: Math.floor((Date.now() - entry.timestamp) / 1000),
      hits: entry.hits,
      size: JSON.stringify(entry.data).length
    }))
});