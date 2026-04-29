// services/admin.auth.services.ts - WITH RATE LIMITING

import prisma from "../prisma";
import { AdminLoginAuthTypes } from "../types/admin.auth";
import { AdminJwtUtils } from "../utils/admin.jwtutils";
import { comparePassword } from "../utils/shared.bcrypt";

// In-memory rate limiter for admin login
interface RateLimitRecord {
  count: number;
  firstAttempt: number;
  lockedUntil?: number;
}

const adminLoginAttempts = new Map<string, RateLimitRecord>();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(email: string): { 
  allowed: boolean; 
  remainingAttempts: number; 
  lockoutMinutes?: number;
  isLocked: boolean;
} {
  const now = Date.now();
  const record = adminLoginAttempts.get(email);
  
  if (!record) {
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS, isLocked: false };
  }
  
  // Check if currently locked
  if (record.lockedUntil && record.lockedUntil > now) {
    const lockoutMinutes = Math.ceil((record.lockedUntil - now) / 60000);
    return { 
      allowed: false, 
      remainingAttempts: 0, 
      lockoutMinutes,
      isLocked: true 
    };
  }
  
  // Reset if window expired
  if (now - record.firstAttempt > ATTEMPT_WINDOW) {
    adminLoginAttempts.delete(email);
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS, isLocked: false };
  }
  
  const remainingAttempts = Math.max(0, MAX_LOGIN_ATTEMPTS - record.count);
  const isLocked = record.count >= MAX_LOGIN_ATTEMPTS;
  
  if (isLocked) {
    return { 
      allowed: false, 
      remainingAttempts: 0, 
      lockoutMinutes: Math.ceil(LOCKOUT_DURATION / 60000),
      isLocked: true 
    };
  }
  
  return { allowed: true, remainingAttempts, isLocked: false };
}

function recordFailedAttempt(email: string): { 
  remainingAttempts: number; 
  isLocked: boolean;
  lockoutMinutes?: number;
} {
  const now = Date.now();
  const existing = adminLoginAttempts.get(email);
  
  if (!existing) {
    adminLoginAttempts.set(email, { count: 1, firstAttempt: now });
    return { remainingAttempts: MAX_LOGIN_ATTEMPTS - 1, isLocked: false };
  }
  
  // Check if window expired
  if (now - existing.firstAttempt > ATTEMPT_WINDOW) {
    adminLoginAttempts.set(email, { count: 1, firstAttempt: now });
    return { remainingAttempts: MAX_LOGIN_ATTEMPTS - 1, isLocked: false };
  }
  
  const newCount = existing.count + 1;
  const isLocked = newCount >= MAX_LOGIN_ATTEMPTS;
  
  adminLoginAttempts.set(email, {
    ...existing,
    count: newCount,
    lockedUntil: isLocked ? now + LOCKOUT_DURATION : existing.lockedUntil
  });
  
  return {
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - newCount),
    isLocked,
    lockoutMinutes: isLocked ? Math.ceil(LOCKOUT_DURATION / 60000) : undefined
  };
}

function clearRateLimit(email: string) {
  adminLoginAttempts.delete(email);
}

export class AdminAuthServices {

  static async login(email: string, password: string): Promise<AdminLoginAuthTypes> {
    try {
      if (!email || !password) {
        return {
          success: false,
          message: "All fields are required"
        };
      }

      // Check rate limit BEFORE attempting login
      const rateLimit = checkRateLimit(email);
      
      if (!rateLimit.allowed) {
        return {
          success: false,
          message: rateLimit.lockoutMinutes 
            ? `Too many failed attempts. Account locked for ${rateLimit.lockoutMinutes} minutes.`
            : "Too many failed attempts. Please try again later.",
          remainingAttempts: 0,
          isLocked: true,
          lockoutMinutes: rateLimit.lockoutMinutes
        };
      }

      const admin = await prisma.systemAdmin.findUnique({
        where: { email }
      });

      if (!admin) {
        // Record failed attempt
        const { remainingAttempts, isLocked, lockoutMinutes } = recordFailedAttempt(email);
        
        return {
          success: false,
          message: "Admin not found",
          remainingAttempts,
          isLocked,
          lockoutMinutes
        };
      }

      // Check if admin is active
      if (!admin.isActive) {
        // Record failed attempt for active check failure
        const { remainingAttempts, isLocked, lockoutMinutes } = recordFailedAttempt(email);
        
        return {
          success: false,
          message: "Admin account is deactivated",
          remainingAttempts,
          isLocked,
          lockoutMinutes
        };
      }

      const validAdminPassword = await comparePassword(password, admin.passwordHash);

      if (!validAdminPassword) {
        // Record failed attempt for invalid password
        const { remainingAttempts, isLocked, lockoutMinutes } = recordFailedAttempt(email);
        
        return {
          success: false,
          message: "Invalid password",
          remainingAttempts,
          isLocked,
          lockoutMinutes
        };
      }

      // Clear rate limit on successful login
      clearRateLimit(email);

      const token = AdminJwtUtils.generateToken(admin.id, admin.email, admin.role);

      await prisma.systemAdmin.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() }
      });

      return {
        success: true,
        message: "Login Successfully",
        token,
        admin: {
          id: admin.id,
          fullName: admin.fullName,
          email: admin.email,
          role: admin.role,
          isActive: admin.isActive,
          lastLoginAt: admin.lastLoginAt
        }
      };

    } catch (e: any) {
      return {
        success: false,
        message: e.message
      };
    }
  }
}