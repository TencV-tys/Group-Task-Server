import { Request, Response, NextFunction} from "express";
import jwt from "jsonwebtoken";
import { success } from "zod";

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
          if(!req.cookies || !req.cookies.userToken){
        return res.status(401).json({
            success:false,
            message:"No authentication token provided"
        });
      }

      const userToken = req.cookies.userToken;
       
       if(!process.env.USER_JWT_SECRET){
        return res.status(500).json({
            success:false,
            message:"Server config error"
        })
       }

          
      const decodedUserToken = jwt.verify(userToken,process.env.JWT_SECRET as string) as UserJwtPayload;
          
      req.user = {
         id:decodedUserToken.userId,
         email:decodedUserToken.email,
         role:decodedUserToken.role
      }
      
      next();

    }catch(error:any){

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
            success:false,
            message:"Failed to decode ",
            error:error.message

        });
    }




};