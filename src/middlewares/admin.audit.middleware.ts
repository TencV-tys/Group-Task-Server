// middlewares/admin.audit.middleware.ts
import { Response, NextFunction } from "express";
import { AdminAuthRequest } from "./admin.auth.middleware";
import { AdminAuditService } from "../services/admin.audit.services";

export const AuditLog = (action: string, getTargetUserId?: (req: AdminAuthRequest) => string | undefined) => {
  return async (req: AdminAuthRequest, res: Response, next: NextFunction) => {
    // Store original json method
    const originalJson = res.json;
    
    // Override json method to capture response
    res.json = function(body) {
      // Only log successful actions
      if (body.success) {
        let targetUserId: string | undefined;
        
        if (getTargetUserId) {
          const result = getTargetUserId(req);
          // Handle if result is an array (like from req.params)
          if (Array.isArray(result)) {
            targetUserId = result[0]; // Take first element if array
          } else {
            targetUserId = result;
          }
        }
        
        // Log asynchronously - don't await
        AdminAuditService.createLog(
          req.admin?.id!,
          action,
          {
            targetUserId,
            details: {
              method: req.method,
              path: req.path,
              params: req.params,
              query: req.query,
              body: req.body,
              response: body
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          }
        ).catch(err => console.error('Failed to create audit log:', err));
      }
      
      // Call original json
      return originalJson.call(this, body);
    };
    
    next();
  };
};