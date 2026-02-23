// controllers/user.auth.controller.ts
import {Request,Response} from 'express';
import { UserServices } from '../services/user.auth.services';
import { UserRefreshToken } from '../services/user.create.refreshToken.services';
import { UserJwtUtils } from '../utils/user.jwtutils';
import { UserRefreshServices } from '../services/user.refresh.services';
import { UserLogoutServices } from '../services/user.logout.services';

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
            token: result.token, // ← ADD THIS!
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
            token: result.token, // ← ADD THIS!
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
            token: result.accessToken, // ← ADD THIS!
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
}