// middlewares/db.monitor.ts - COMPLETE FILE

import { Request, Response, NextFunction } from 'express';

interface DbStats {
  activeQueries: number;
  totalQueries: number;
  slowQueries: number;
  timestamp: Date;
}

let activeQueries = 0;
let totalQueries = 0;
let slowQueries = 0;

export const dbMonitorMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  activeQueries++;
  totalQueries++;
  
  res.on('finish', () => {
    activeQueries--;
    const duration = Date.now() - startTime;
    
    if (duration > 1000) {
      slowQueries++;
      console.warn(`⚠️ Slow query: ${req.method} ${req.originalUrl} - ${duration}ms`);
    }
    
    if (process.env.NODE_ENV === 'development' && activeQueries > 10) {
      console.warn(`⚠️ High DB concurrency: ${activeQueries} active queries`);
    }
  });
  
  next();
};

export const getDbStats = (): DbStats => ({
  activeQueries,
  totalQueries,
  slowQueries,
  timestamp: new Date()
});

// Optional: Reset stats
export const resetDbStats = () => {
  activeQueries = 0;
  totalQueries = 0;
  slowQueries = 0;
};