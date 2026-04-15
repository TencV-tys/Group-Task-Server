// types/user.auth.ts - UPDATED

import { UserRole, UserRoleStatus, Gender } from "@prisma/client";

export interface UserSignUpAuthTypes {
  success: boolean;
  message: string;
  token?: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
    passwordHash: string;
    avatarUrl?: string | null;
    avatarBase64?: string | null;
    gender?: Gender | string | null;
    role: UserRole;
    roleStatus: UserRoleStatus;
  };
  error?: string;
}

export interface UserLoginAuthTypes {
  success: boolean;
  message: string;
  token?: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl?: string | null;
    gender?: Gender | string | null;
    role: UserRole;
    roleStatus: UserRoleStatus;
  };
  field?: 'email' | 'password';
  // ✅ ADD THESE FIELDS
  remainingAttempts?: number;
  isLocked?: boolean;
  lockoutMinutes?: number;
  error?: string;
}