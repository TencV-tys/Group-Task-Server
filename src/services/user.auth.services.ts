// services/user.auth.services.ts - FULLY UPDATED with remainingAttempts

import { UserJwtUtils } from './../utils/user.jwtutils';
import { UserRole, UserRoleStatus, Gender } from "@prisma/client";
import prisma from "../prisma";
import { UserSignUpAuthTypes, UserLoginAuthTypes } from "../types/user.auth";
import { comparePassword, hashedPassword } from "../utils/shared.bcrypt";
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Rate limiting map for failed attempts (in production, use Redis)
const failedLoginAttempts = new Map<string, { count: number; lastAttempt: Date }>();

export class UserServices {
  
  // ===== SECURITY CONSTANTS =====
  private static readonly MAX_LOGIN_ATTEMPTS = 5;
  private static readonly LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes
  private static readonly PASSWORD_MIN_LENGTH = 8;
  private static readonly PASSWORD_MAX_LENGTH = 128;
  private static readonly NAME_MIN_LENGTH = 2;
  private static readonly NAME_MAX_LENGTH = 50;
  private static readonly ALLOWED_IMAGE_TYPES = ['jpeg', 'jpg', 'png', 'gif', 'webp'];
  private static readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

  // ===== SECURE SIGNUP =====
  static async signup(
    email: string,
    fullName: string,
    password: string,
    confirmPassword: string,
    avatarData?: string | null,
    gender?: string | null
  ): Promise<UserSignUpAuthTypes> {
    try {
      console.log("UserServices.signup called");

      // ===== INPUT SANITIZATION & VALIDATION =====
      if (!email || !password || !confirmPassword || !fullName) {
        return {
          success: false,
          message: "All fields are required"
        };
      }

      const sanitizedEmail = this.sanitizeEmail(email);
      const sanitizedName = this.sanitizeInput(fullName);

      if (!this.isValidEmail(sanitizedEmail)) {
        return {
          success: false,
          message: "Invalid email format"
        };
      }

      if (!this.isValidName(sanitizedName)) {
        return {
          success: false,
          message: `Full name must be between ${this.NAME_MIN_LENGTH} and ${this.NAME_MAX_LENGTH} characters and contain only letters, spaces, and basic punctuation`
        };
      }

      // ===== PASSWORD SECURITY =====
      if (!this.isValidPassword(password)) {
        return {
          success: false,
          message: `Password must be at least ${this.PASSWORD_MIN_LENGTH} characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character`
        };
      }

      if (password !== confirmPassword) {
        return {
          success: false,
          message: "Passwords do not match"
        };
      }

      if (this.isCommonPassword(password)) {
        return {
          success: false,
          message: "This password is too common. Please choose a stronger password"
        };
      }

      // ===== GENDER VALIDATION =====
      let genderEnum: Gender | null = null;
      if (gender) {
        const upperGender = gender.toUpperCase();
        const validGenders = Object.values(Gender) as string[];
        
        if (validGenders.includes(upperGender)) {
          genderEnum = upperGender as Gender;
        } else {
          return {
            success: false,
            message: `Invalid gender. Must be one of: ${validGenders.join(', ')}`
          };
        }
      }

      // ===== CHECK EXISTING USER =====
      const existingUser = await prisma.user.findUnique({
        where: { email: sanitizedEmail }
      });
 
      if (existingUser) {
        return {
          success: false,
          message: "An account with this email already exists. Please login instead.",
        };
      }

      // ===== SECURE AVATAR PROCESSING =====
      let avatarUrl: string | null = null;
      
      if (avatarData) {
        try {
          if (avatarData.startsWith('data:image')) {
            console.log("Processing secure avatar...");
            avatarUrl = await this.secureSaveBase64Image(avatarData, sanitizedEmail);
          } else if (avatarData.startsWith('http')) {
            if (this.isValidUrl(avatarData)) {
              avatarUrl = avatarData;
            } else {
              console.log("Invalid URL format");
            }
          }
        } catch (avatarError: any) {
          console.error("Avatar processing failed:", avatarError.message);
        }
      }

      // ===== SECURE PASSWORD HASHING =====
      const passwordHashed = await hashedPassword(password, 12);

      // ===== CREATE USER =====
      const user = await prisma.user.create({
        data: {
          fullName: sanitizedName,
          email: sanitizedEmail,
          passwordHash: passwordHashed,
          avatarUrl: avatarUrl,
          gender: genderEnum,
          role: UserRole.USER,
          roleStatus: UserRoleStatus.ACTIVE,
          lastLoginAt: new Date()
        }
      });

      const token = UserJwtUtils.generateToken(user.id, user.email, user.role);
      failedLoginAttempts.delete(sanitizedEmail);

      return {
        success: true,
        message: "Registration successful",
        token,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          passwordHash: user.passwordHash,
          avatarUrl: user.avatarUrl,
          gender: user.gender as Gender | null,
          role: user.role,
          roleStatus: user.roleStatus
        }
      };

    } catch (e: any) {
      console.error("Signup error:", e);
      this.logSecurityEvent('SIGNUP_ERROR', { email, error: e.message });
      return {
        success: false,
        message: "Registration failed. Please try again later.",
        error: process.env.NODE_ENV === 'development' ? e.message : undefined
      };
    } 
  }

  // ===== UPDATED LOGIN METHOD WITH REMAINING ATTEMPTS =====
  static async login(email: string, password: string): Promise<UserLoginAuthTypes> {
    try {
      // ===== INPUT VALIDATION =====
      if (!email || !password) {
        return {
          success: false,
          message: "Email and password are required"
        };
      }

      const sanitizedEmail = this.sanitizeEmail(email);

      // ===== RATE LIMITING CHECK =====
      if (this.isRateLimited(sanitizedEmail)) {
        const attempts = failedLoginAttempts.get(sanitizedEmail);
        const waitTime = Math.ceil((this.LOCKOUT_TIME - (Date.now() - (attempts?.lastAttempt?.getTime() || 0))) / 60000);
        
        const remainingAttempts = 0;  // ← Add this
        return {
          success: false,
          message: `Too many failed attempts. Please try again in ${waitTime} minutes.`,
          isLocked: true,
          lockoutMinutes: waitTime,
            remainingAttempts: remainingAttempts
        };
      }

      // ===== FETCH USER =====
      const user = await prisma.user.findUnique({
        where: { email: sanitizedEmail }
      });

      // ===== CHECK IF EMAIL EXISTS =====
      if (!user) {
        const attemptInfo = this.recordFailedAttempt(sanitizedEmail);
        const remainingAttempts = Math.max(0, this.MAX_LOGIN_ATTEMPTS - (attemptInfo?.count || 1));
        
        return {
          success: false,
          message: "Email not found",
          field: "email",
          remainingAttempts: remainingAttempts
        };
      }

      // ===== CHECK PASSWORD =====
      const isValidPassword = await comparePassword(password, user.passwordHash);
      
      if (!isValidPassword) {
        const attemptInfo = this.recordFailedAttempt(sanitizedEmail);
        const remainingAttempts = Math.max(0, this.MAX_LOGIN_ATTEMPTS - (attemptInfo?.count || 1));
        const isLocked = (attemptInfo?.count || 1) >= this.MAX_LOGIN_ATTEMPTS;
        
        return {
          success: false,
          message: isLocked ? "Account temporarily locked due to too many failed attempts" : "Incorrect password",
          field: "password",
          remainingAttempts: remainingAttempts,
          isLocked: isLocked,
          lockoutMinutes: isLocked ? Math.ceil(this.LOCKOUT_TIME / 60000) : undefined
        };
      }

      // ===== CHECK USER STATUS =====
      if (user.roleStatus !== UserRoleStatus.ACTIVE) {
        return {
          success: false,
          message: "Account is not active. Please contact support.",
          field: "email"
        };
      }

      // ===== GENERATE TOKEN =====
      const userId = user.id as unknown as string;
      const token = UserJwtUtils.generateToken(userId, user.email, user.role);

      // ===== UPDATE LAST LOGIN =====
      await prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() }
      });

      // ===== CLEAR FAILED ATTEMPTS =====
      failedLoginAttempts.delete(sanitizedEmail);

      return {
        success: true,
        message: "Login successful",
        token,
        user: {
          id: userId,
          fullName: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          gender: user.gender as Gender | null,
          role: user.role,
          roleStatus: user.roleStatus
        }
      };

    } catch (e: any) {
      console.error("Login error:", e);
      this.logSecurityEvent('LOGIN_ERROR', { email, error: e.message });
      return {
        success: false,
        message: "Login failed. Please try again later.",
        error: process.env.NODE_ENV === 'development' ? e.message : undefined
      };
    }  
  }

  // ===== SECURE AVATAR SAVING =====
  private static async secureSaveBase64Image(base64String: string, email: string): Promise<string | null> {
    try {
      const matches = base64String.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        console.log("Invalid base64 format");
        return null;
      }

      const imageType = matches[1]?.toLowerCase();
      const base64Data = matches[2];
      
      if (!imageType || !base64Data) {
        console.log("Invalid base64 data format");
        return null;
      }

      if (!this.ALLOWED_IMAGE_TYPES.includes(imageType)) {
        console.log(`Invalid image type: ${imageType}`);
        return null;
      }

      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      if (imageBuffer.length > this.MAX_IMAGE_SIZE) {
        console.log("Image too large:", imageBuffer.length);
        return null;
      }

      if (this.hasMalwareSignature(imageBuffer)) {
        console.log("Potential malware detected in image");
        return null;
      }

      const uploadsDir = path.join(__dirname, '../../uploads/avatars');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true, mode: 0o755 });
      }

      const hash = crypto.createHash('sha256').update(email + Date.now() + crypto.randomBytes(16)).digest('hex');
      const filename = `${hash}.${imageType}`;
      const filePath = path.join(uploadsDir, filename);

      fs.writeFileSync(filePath, imageBuffer, { mode: 0o644 });
      console.log("Avatar saved securely to:", filePath);

      return `/uploads/avatars/${filename}`;

    } catch (error: any) {
      console.error("Error saving base64 image:", error.message);
      return null;
    }
  }

  // ===== SECURITY HELPER METHODS =====

  private static sanitizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  private static sanitizeInput(input: string): string {
    return input.replace(/[<>\"'%;()&]/g, '').trim();
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  private static isValidName(name: string): boolean {
    return name.length >= this.NAME_MIN_LENGTH && 
           name.length <= this.NAME_MAX_LENGTH &&
           /^[a-zA-Z\s\-']+$/.test(name);
  }

  private static isValidPassword(password: string): boolean {
    if (password.length < this.PASSWORD_MIN_LENGTH || password.length > this.PASSWORD_MAX_LENGTH) {
      return false;
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);

    return hasUpperCase && hasLowerCase && hasNumbers && hasSpecial;
  }

  private static isCommonPassword(password: string): boolean {
    const commonPasswords = [
      'password123', '12345678', 'qwerty123', 'admin123', 
      'letmein', 'welcome', 'monkey', 'dragon', 'master',
      'Password1!', 'Admin123!', 'Qwerty123!'
    ];
    return commonPasswords.includes(password.toLowerCase());
  }

  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return url.startsWith('https://') || url.startsWith('http://localhost');
    } catch {
      return false;
    }
  }

  private static hasMalwareSignature(buffer: Buffer): boolean {
    const suspiciousPatterns = [
      '<?php', '<script', 'eval(', 'base64_decode',
      '<?=', '<?xml', '<!DOCTYPE', '<?'
    ];
    
    const bufferString = buffer.toString().toLowerCase();
    return suspiciousPatterns.some(pattern => bufferString.includes(pattern));
  }

  private static isRateLimited(email: string): boolean {
    const attempt = failedLoginAttempts.get(email);
    if (!attempt) return false;

    const now = Date.now();
    const timeSinceLastAttempt = now - attempt.lastAttempt.getTime();

    if (timeSinceLastAttempt > this.LOCKOUT_TIME) {
      failedLoginAttempts.delete(email);
      return false;
    }

    return attempt.count >= this.MAX_LOGIN_ATTEMPTS;
  }

  // ✅ UPDATED: Returns the attempt info
  private static recordFailedAttempt(email: string): { count: number; lastAttempt: Date } {
    const attempt = failedLoginAttempts.get(email) || { count: 0, lastAttempt: new Date() };
    attempt.count++;
    attempt.lastAttempt = new Date();
    failedLoginAttempts.set(email, attempt);

    this.logSecurityEvent('FAILED_LOGIN_ATTEMPT', { email, count: attempt.count });
    
    return attempt;
  }

  private static logSecurityEvent(event: string, data: any): void {
    console.log(`🔒 SECURITY EVENT [${event}]:`, {
      ...data,
      timestamp: new Date().toISOString(),
      ip: 'REDACTED',
      userAgent: 'REDACTED'
    });
  }
}