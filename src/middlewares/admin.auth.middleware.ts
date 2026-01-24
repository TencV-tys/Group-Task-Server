import { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';

export interface AdminJwtPayload{
    adminId:string;
    email:string;
    role:string;
}

export interface AdminAuthRequest extends Request{
    admin?:{
        id:string;
        email:string;
        role:string;
    }

}

export const AdminAuthMiddleware = (req:AdminAuthRequest, res:Response, next:NextFunction) =>{
    try{
           
        if(!req.cookies || !req.cookies.adminToken){
            return res.status(401).json({
                success:false,
                message:"Admin authentication required"
            })
        }

        const adminToken = req.cookies.adminToken;
             
        
        if(!process.env.ADMIN_JWT_SECRET){
            return res.status(500).json({
                success:false,
                message:"Server config error"
            })
        }
         
        const decodedAdminToken = jwt.verify(adminToken,process.env.ADMIN_JWT_SECRET as string ) as AdminJwtPayload;

        req.admin = {
            id:decodedAdminToken.adminId,
            email:decodedAdminToken.email,
            role:decodedAdminToken.role
        }
        
        next();


    }catch(e:any){
           
        if(e.name === "JsonWebTokenError"){
             return res.status(401).json({
                success:false,
                message:"Invalid admin token error"
             });
        }
        
        if(e.name === "TokenExpiredError"){
             return res.status(401).json({
                success:false,
                message:"Admin token expired"
             });
        }

        return res.status(500).json({
            success:false,
            message:"Admin authentication failed",
            error:e.message
        });
    }

}