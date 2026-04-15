// controllers/user.auth.controller.ts - UPDATED with correct password validation

import {Request,Response} from 'express';
import { UserServices } from '../services/user.auth.services';
import { UserRefreshToken } from '../services/user.create.refreshToken.services';
import { UserJwtUtils } from '../utils/user.jwtutils';
import { UserRefreshServices } from '../services/user.refresh.services';
import { UserLogoutServices } from '../services/user.logout.services';
import { UserAuthRequest } from '../middlewares/user.auth.middleware';
import prisma from '../prisma';
import bcrypt from 'bcryptjs';

// Password validation helper (matching frontend)
const validatePasswordStrength = (password: string): { isValid: boolean; message?: string } => {
  if (!password) {
    return { isValid: false, message: "Password is required" };
  }
  if (password.length < 8) {
    return { isValid: false, message: "Password must be at least 8 characters" };
  }
  if (password.length > 128) {
    return { isValid: false, message: "Password is too long (max 128 characters)" };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, message: "Password must contain at least one uppercase letter (A-Z)" };
  }
  if (!/[a-z]/.test(password)) {
    return { isValid: false, message: "Password must contain at least one lowercase letter (a-z)" };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, message: "Password must contain at least one number (0-9)" };
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return { isValid: false, message: "Password must contain at least one special character (!@#$%^&* etc.)" };
  }
  return { isValid: true };
};

export class UserAuthController{
 
  // ===== SIGNUP - Returns both tokens =====
  static async signup(req: Request, res: Response) {
    try {
        console.log("=== CONTROLLER SIGNUP ===");
        console.log("Request body:", req.body);
        
        const { fullName, email, password, confirmPassword, avatarUrl, avatarBase64, gender } = req.body;
         
        const avatarData = avatarBase64 || avatarUrl;
        console.log("Calling UserServices.signup...");
        const result = await UserServices.signup(email, fullName, password, confirmPassword, avatarData, gender);
        
        console.log("UserServices result:", result);

        if (!result.success || !result.user) {
            console.log("Signup failed in controller");
            return res.status(400).json({
                success: false,
                message: result.message || 'Authentication Failed'
            });
        } 

        console.log("Signup successful, setting cookies...");
        const user = result.user;
        const userRefreshToken = UserJwtUtils.generateRefreshToken(user.id, user.email, user.role);
        
        await UserRefreshToken.createRefreshToken(user.id, userRefreshToken);

        // Set cookies (for web compatibility)
        res.cookie('userToken', result.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/'
        });
        
        res.cookie('userRefreshToken', userRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/'
        });
        
        console.log("=== CONTROLLER SIGNUP COMPLETE ===");
        
        // ✅ RETURN BOTH TOKENS for React Native
        return res.json({
            success: true,
            message: result.message,
            accessToken: result.token,      // ← Access token for API calls
            refreshToken: userRefreshToken, // ← Refresh token for getting new access tokens
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl,
                gender: user.gender,
                role: user.role
            }
        });

    } catch (e: any) {
        console.error("Controller error:", e);
        return res.status(500).json({
            success: false,
            message: e.message
        });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      const result = await UserServices.login(email, password);

      // ✅ Handle failed login with all error details
      if (!result.success) {
        return res.status(401).json({
          success: false,
          message: result.message || "Authentication Failed",
          field: result.field,
          remainingAttempts: result.remainingAttempts,
          isLocked: result.isLocked,
          lockoutMinutes: result.lockoutMinutes
        });
      }

      // ✅ Ensure user exists
      if (!result.user) {
        return res.status(401).json({
          success: false,
          message: "Authentication Failed"
        });
      }

      const user = result.user;
      const userRefreshToken = UserJwtUtils.generateRefreshToken(user.id, user.email, user.role);

      // Set cookies (for web compatibility)
      res.cookie('userToken', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/'
      });

      res.cookie('userRefreshToken', userRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/'
      });

      await UserRefreshToken.createRefreshToken(user.id, userRefreshToken);

      // ✅ RETURN BOTH TOKENS for React Native
      return res.json({
        success: true,
        message: result.message,
        accessToken: result.token,
        refreshToken: userRefreshToken,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          gender: user.gender,
          role: user.role
        }
      });

    } catch (e: any) {
      console.error("Login error:", e);
      return res.status(500).json({
        success: false,
        message: e.message || "Internal server error"
      });
    }
  }

  // ===== REFRESH TOKEN - Returns new access token =====
  static async refreshToken(req:Request,res:Response){
    try{
        const authHeader = req.headers.authorization;
        const refreshTokenFromHeader = authHeader?.startsWith('Bearer ') 
          ? authHeader.substring(7) 
          : null;
        
        const userRefreshToken = req.cookies.userRefreshToken || refreshTokenFromHeader;

        if(!userRefreshToken){
            return res.status(400).json({ 
                success:false,
                message:"Refresh token required"
            });
        }

        const result = await UserRefreshServices.refreshUserToken(userRefreshToken);

        if(!result.success){
            res.clearCookie('userToken');
            res.clearCookie('userRefreshToken');

            return res.status(401).json({
                success:false,
                message:result.message
            });
        }

        res.cookie('userToken', result.accessToken, {
            httpOnly:true,
            secure:process.env.NODE_ENV === "production",
            sameSite:"lax",
            maxAge: 15 * 60 * 1000,
            path: '/'
        });

        return res.json({
            success:true,
            message:"Token refreshed successfully",
            accessToken: result.accessToken,
            user:result.user
        });

    } catch(e:any){
        res.clearCookie('userToken');
        res.clearCookie('userRefreshToken');
        
        return res.status(500).json({
            success:false,
            message:"Token refresh failed"
        });
    }
  }

  // ===== LOGOUT =====
  static async logout(req:Request, res:Response){
    try{
        const userRefreshToken = req.cookies.userRefreshToken;
        let userId: string | undefined;
        const accessToken = req.cookies.userToken;

        if(accessToken){
            try{
                const decoded = UserJwtUtils.verifyToken(accessToken);
                userId = decoded.userId;
            } catch(e){
                console.error("Access token expired during logout");
            }
        }
              
        const result = await UserLogoutServices.userLogout(userRefreshToken, userId);

        if(!result.success){
            console.warn(`Logout service returned error: ${result.message}`);
        }
                 
        res.clearCookie('userToken');
        res.clearCookie('userRefreshToken');

        return res.json({
            success:true,
            message:result.message
        });

    } catch(e:any){
        console.error("Logout error:", e);
        res.clearCookie('userToken');
        res.clearCookie('userRefreshToken');
        
        return res.status(500).json({
            success: false,
            message: "Logout failed"
        });
    }
  }

  // ===== GET CURRENT USER =====
  static async getCurrentUser(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
       
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          gender: true,
          role: true,
          roleStatus: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          avatarUrl: user.avatarUrl,
          gender: user.gender,
          role: user.role,
          roleStatus: user.roleStatus,
          createdAt: user.createdAt
        }
      });

    } catch (error: any) {
      console.error("Error in getCurrentUser:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch user data"
      });
    }
  }

  // ===== UPDATE PROFILE =====
  static async updateProfile(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { fullName } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!fullName || fullName.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Full name is required"
        });
      }

      if (fullName.length > 100) {
        return res.status(400).json({
          success: false,
          message: "Full name cannot exceed 100 characters"
        });
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { fullName: fullName.trim() },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          gender: true,
          role: true,
          roleStatus: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return res.json({
        success: true,
        message: "Profile updated successfully",
        user: updatedUser
      });

    } catch (error: any) {
      console.error("Error in updateProfile:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update profile"
      });
    }
  }

  // ===== CHANGE PASSWORD - UPDATED with proper validation =====
  static async changePassword(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { currentPassword, newPassword } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required"
        });
      }

      // ✅ UPDATED: Use the same password validation as signup
      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: passwordValidation.message
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect"
        });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 12); // Use 12 rounds like signup

      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash }
      });

      return res.json({
        success: true,
        message: "Password changed successfully"
      });

    } catch (error: any) {
      console.error("Error in changePassword:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to change password"
      });
    }
  }

  // ===== DELETE ACCOUNT =====
  static async deleteAccount(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { password } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      if (!password) {
        return res.status(400).json({
          success: false,
          message: "Password is required to delete account"
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: "Password is incorrect"
        });
      }

      await prisma.user.delete({
        where: { id: userId }
      });

      res.clearCookie('userToken');
      res.clearCookie('userRefreshToken');

      return res.json({
        success: true,
        message: "Account deleted successfully"
      });

    } catch (error: any) {
      console.error("Error in deleteAccount:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to delete account"
      });
    }
  }
}