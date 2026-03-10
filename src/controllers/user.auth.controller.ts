// controllers/user.auth.controller.ts - UPDATED with profile methods
import {Request,Response} from 'express';
import { UserServices } from '../services/user.auth.services';
import { UserRefreshToken } from '../services/user.create.refreshToken.services';
import { UserJwtUtils } from '../utils/user.jwtutils';
import { UserRefreshServices } from '../services/user.refresh.services';
import { UserLogoutServices } from '../services/user.logout.services';
import { UserAuthRequest } from '../middlewares/user.auth.middleware';
import prisma from '../prisma';
import bcrypt from 'bcryptjs';

export class UserAuthController{
 
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
        
        // ✅ RETURN TOKEN IN RESPONSE for React Native
        return res.json({
            success: true,
            message: result.message,
            token: result.token,
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

  static async login(req:Request, res:Response){
    try{
        const {email,password} = req.body;

        const result = await UserServices.login(email,password);

        if(!result.success || !result.user ){
            return res.status(401).json({
                success:false,
                message:result.message || "Authentication Failed"
            }); 
        }  
        
        const user = result.user;
        const userRefreshToken = UserJwtUtils.generateRefreshToken(user.id, user.email, user.role);

        // Set cookies (for web compatibility)
        res.cookie('userToken', result.token, {
            httpOnly:true,
            secure:process.env.NODE_ENV === "production",
            sameSite:"lax",
            maxAge:7 * 24 * 60 * 60 * 1000,
            path: '/'
        });

        res.cookie('userRefreshToken', userRefreshToken, {
            httpOnly:true,
            secure:process.env.NODE_ENV === "production",
            sameSite:'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/'
        });
        
        await UserRefreshToken.createRefreshToken(user.id, userRefreshToken);

        // ✅ RETURN TOKEN IN RESPONSE for React Native
        return res.json({
            success:true,
            message:result.message,
            token: result.token,
            user:{
                id:user.id,
                fullName:user.fullName,
                email:user.email,
                avatarUrl:user.avatarUrl,
                gender:user.gender,
                role:user.role
            }
        });

    } catch(e:any){
        return res.status(500).json({
            success:false,
            message:e.message
        });
    }
  }

  static async refreshToken(req:Request,res:Response){
    try{
        const userRefreshToken = req.cookies.userRefreshToken;

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

        // ✅ RETURN NEW TOKEN IN RESPONSE for React Native
        return res.json({
            success:true,
            message:"Token refreshed successfully",
            token: result.accessToken,
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

  static async getCurrentUser(req: UserAuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
       
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated"
        });
      }

      // Fetch fresh user data from database
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

  // ===== NEW: Update user profile =====
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

      // Update user in database
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

  // ===== NEW: Change password =====
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

      // Validate inputs
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required"
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters"
        });
      }

      // Get user with password
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

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect"
        });
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Update password
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

  // ===== NEW: Delete account =====
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

      // Get user with password
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

      // Verify password
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: "Password is incorrect"
        });
      }

      // Delete user (cascade will handle related records)
      await prisma.user.delete({
        where: { id: userId }
      });

      // Clear cookies
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