// middlewares/admin.audit.middleware.ts - UPDATED
import { Response, NextFunction } from "express";
import { AdminAuthRequest } from "./admin.auth.middleware";
import { AdminAuditService } from "../services/admin.audit.services";

export const AuditLog = (action: string, getTargetUserId?: (req: AdminAuthRequest) => string | undefined) => {
  return async (req: AdminAuthRequest, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json;
    
    // Override json method to capture response
    res.json = function(body) {
      // ✅ CRITICAL: ONLY LOG IF REQUEST WAS SUCCESSFUL
      // Check all conditions:
      // 1. Response indicates success (body.success === true)
      // 2. Admin is authenticated (req.admin?.id exists)
      // 3. Response status code is in 2xx range
      if (body?.success === true && req.admin?.id && res.statusCode >= 200 && res.statusCode < 300) {
        
        // Log asynchronously - with error handling
        AdminAuditService.createLog(
          req.admin.id,
          action,
          {
            targetUserId: getTargetUserId ? getTargetUserId(req) : undefined,
            details: {
              method: req.method,
              path: req.path,
              params: req.params,
              query: req.query,
              // Don't log entire body for large requests
              body: req.body && Object.keys(req.body).length > 10 ? '[TRUNCATED]' : req.body,
              statusCode: res.statusCode
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          }
        ).catch(err => {
          // Silent fail in production
          if (process.env.NODE_ENV !== 'production') {
            console.error('Audit log failed (non-critical):', err.message);
          }
        });
      } else {
        // Track failed requests for rate limiting
        if (req.ip) {
          AdminAuditService.trackFailedRequest(req.ip, req.admin?.id);
        }
      }
      
      // Call original json
      return originalJson.call(this, body);
    };
    
    next();
  }; 
};