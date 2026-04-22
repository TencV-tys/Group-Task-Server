// middlewares/cache.middleware.ts - MOBILE OPTIMIZED

import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  data: any;
  timestamp: number;
  etag: string;
  hits: number;
  size: number; // Track response size for memory management
}

const cache = new Map<string, CacheEntry>();
const DEFAULT_CACHE_TTL = 30 * 1000; // ✅ Reduced to 30 seconds for mobile (fresher data)
const MAX_CACHE_SIZE = 50; // ✅ Limit cache size for mobile memory

// Cache stats for monitoring
let cacheHits = 0;
let cacheMisses = 0; 

// ✅ Clean up more frequently for mobile (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  let deletedCount = 0;
  let size = 0;
  
  for (const [key, entry] of cache.entries()) {
    size++;
    if (now - entry.timestamp > DEFAULT_CACHE_TTL) {
      cache.delete(key);
      deletedCount++;
    }
  }
  
  // ✅ Enforce max cache size (LRU-like)
  if (size > MAX_CACHE_SIZE) {
    const entriesToDelete = size - MAX_CACHE_SIZE;
    const oldestEntries = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, entriesToDelete);
    
    oldestEntries.forEach(([key]) => cache.delete(key));
    deletedCount += oldestEntries.length;
    console.log(`🧹 Enforced max cache size: deleted ${oldestEntries.length} oldest entries`);
  }
  
  if (deletedCount > 0) {
    console.log(`🧹 Cleaned ${deletedCount} expired cache entries`);
  }
}, 5 * 60 * 1000);

// Generate ETag for response data (optimized)
const generateETag = (data: any): string => {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < Math.min(str.length, 1000); i++) { // ✅ Limit string length for performance
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36); // ✅ Shorter ETag
};

// ✅ Routes that should NEVER be cached (mobile-specific)
const NEVER_CACHE_PATTERNS = [
  '/api/assignments/complete',     // Assignment completion
  '/api/assignments/verify',       // Verification
  '/api/swap-requests',            // Swap operations  
  '/api/tasks/create',             // Task creation
  '/api/tasks/update',             // Task updates
  '/api/tasks/delete',             // Task deletion 
  '/api/group/create',             // Group creation
  '/api/group/update',             // Group updates 
  '/api/group/delete',             // Group deletion
  '/api/notifications/read',       // Mark notifications read
  '/api/feedback',                 // Feedback submissions
  '/api/reports',                  // Report submissions
  '/api/uploads',                  // Uploads
  '/api/auth',                     // Auth endpoints
  '/api/home',                     // Home data (personalized)

  '/api/admin/groups',
  '/api/admin/feedback',
  '/api/admin/feedback/stats',
  '/api/admin/notifications',
  '/api/admin/reports',
  '/api/admin/users',
  '/api/admin/dashboard',
  '/api/admin/audit',
  '/api/admin/audit/export',
  '/api/admin/db-stats',
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
    
    // ✅ For mobile, we can cache authenticated data that's the same for all users
    // but with shorter TTL
    const isAuthenticated = !!req.headers.authorization;
    
    // ✅ Use different TTL for authenticated vs public
    const effectiveTTL = isAuthenticated ? Math.min(duration, 15000) : duration; // 15 seconds for authenticated
    
    const key = `${isAuthenticated ? 'auth:' : 'public:'}${req.originalUrl.split('?')[0]}|${JSON.stringify(req.query)}`;
    const cached = cache.get(key);
    
    const ifNoneMatch = req.headers['if-none-match'];
    
    if (cached && Date.now() - cached.timestamp < effectiveTTL) {
      cacheHits++;
      console.log(`✅ Cache hit: ${req.originalUrl}`);
      
      cached.hits++;
      cache.set(key, cached);
      
      if (ifNoneMatch === cached.etag) {
        return res.status(304).send();
      }
      
      res.setHeader('Cache-Control', `private, max-age=${Math.floor(effectiveTTL / 1000)}`);
      res.setHeader('ETag', cached.etag);
      res.setHeader('X-Cache', 'HIT');
      
      return res.json(cached.data);
    }
    
    if (cached) {
      cache.delete(key);
    }
    
    cacheMisses++;
    console.log(`❌ Cache miss: ${req.originalUrl}`);
    
    // Store original json method
    const originalJson = res.json;
    let responseSent = false;
    
    // Override json method to capture response
    res.json = function(body) {
      if (responseSent) {
        return originalJson.call(this, body);
      }
      responseSent = true;
      
      // ✅ Cache successful responses
      if (body && body.success === true) {
        const etag = generateETag(body);
        const responseSize = JSON.stringify(body).length;
        
        cache.set(key, {
          data: body,
          timestamp: Date.now(),
          etag,
          hits: 1,
          size: responseSize
        });
        
        res.setHeader('Cache-Control', `private, max-age=${Math.floor(effectiveTTL / 1000)}`);
        res.setHeader('ETag', etag);
        res.setHeader('X-Cache', 'MISS');
        res.setHeader('X-Cache-Size', `${Math.floor(responseSize / 1024)}KB`); // Mobile: show size
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
  hitRate: cacheHits + cacheMisses > 0 ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100) : 0,
  memoryEstimate: `${(Array.from(cache.values()).reduce((sum, e) => sum + (e.size || 0), 0) / 1024 / 1024).toFixed(2)} MB`
});