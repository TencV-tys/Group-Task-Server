// types/admin.auth.ts

import { SystemAdminRole } from '@prisma/client';

export interface AdminLoginAuthTypes {
  success: boolean;
  message: string;
  token?: string;
  admin?: {
    id: string;
    fullName: string;
    email: string;
    role: SystemAdminRole;
    isActive: boolean;
    lastLoginAt: Date | null;
  };
  error?: string;
  
  // ✅ Rate limiting fields (for failed attempts)
  remainingAttempts?: number;    // How many attempts left before lockout
  isLocked?: boolean;            // Whether account is currently locked
  lockoutMinutes?: number;       // Minutes remaining in lockout (if locked)
}