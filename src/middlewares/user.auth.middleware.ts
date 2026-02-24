import { Request, Response, NextFunction} from "express";
import jwt from "jsonwebtoken";

export interface UserJwtPayload{
    userId:string;
    email:string;
    role:string;
}

export interface UserAuthRequest extends Request{
  user?:{
    id:string;
    email:string;
    role:string;
  }
}

export const UserAuthMiddleware = (req:UserAuthRequest, res:Response, next:NextFunction)=>{
    try{
        console.log("🔐 Auth Middleware - Checking authentication...");
        
        // 1️⃣ FIRST: Check Authorization header (for mobile)
        const authHeader = req.headers.authorization;
        let token = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7); // Remove 'Bearer ' prefix
            console.log("✅ Found token in Authorization header");
        }
        
        // 2️⃣ SECOND: Check cookies (for web fallback)
        if (!token && req.cookies && req.cookies.userToken) {
            token = req.cookies.userToken;
            console.log("✅ Found token in cookies");
        }
        
        // 3️⃣ If no token found anywhere, return error
        if (!token) {
            console.log("❌ No authentication token found");
            return res.status(401).json({
                success: false,
                message: "No authentication token provided"
            });
        }

        console.log("🔑 Verifying token...");
        
        // 4️⃣ Check if JWT secret is configured
        if (!process.env.USER_JWT_SECRET) {
            console.log("❌ USER_JWT_SECRET not configured");
            return res.status(500).json({
                success: false,
                message: "Server configuration error"
            });
        }

        // 5️⃣ Verify the token
        const decodedUserToken = jwt.verify(token, process.env.USER_JWT_SECRET) as UserJwtPayload;
        console.log("✅ Token verified for user:", decodedUserToken.userId);
        
        // 6️⃣ Attach user to request object
        req.user = {
            id: decodedUserToken.userId,
            email: decodedUserToken.email,
            role: decodedUserToken.role
        };
        
        console.log("✅ User authenticated, proceeding to controller");
        next();

    } catch(error: any) {
        console.error("❌ Auth Middleware Error:", error);
        
        // Handle specific JWT errors
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: "Invalid token"
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: "Token expired"
            });
        }

        return res.status(500).json({
            success: false,
            message: "Authentication failed",
            error: error.message
        });
    }
};