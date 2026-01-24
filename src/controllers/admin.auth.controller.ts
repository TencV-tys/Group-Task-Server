import { success } from "zod";
import { AdminAuthServices } from "../services/admin.auth.services";
import { Request,Response } from "express";
import { AdminJwtUtils } from "../utils/admin.jwtutils";
import { AdminRefreshToken } from "../services/admin.refreshToken";
export class AdminAuthController{

   static async login(req:Request,res:Response){
    try{
          const {email,password} = req.body;

          const result = await AdminAuthServices.login(email,password);

          if(!result.success || !result.admin){
            return res.status(401).json({
                success:false,
                message:result.message
            });
          }
          const admin = result.admin;

          const refreshToken = await AdminJwtUtils.generateRefreshToken(admin.id,admin.email,admin.role);
              
          await AdminRefreshToken.createAdminRefreshToken(admin.id,refreshToken);

          res.cookie('adminToken',result.token,{
            httpOnly:true,
            secure:process.env.NODE_ENV === "production",
            sameSite:"strict",
            maxAge:7 * 24 * 60 *60 * 1000
          });

          res.cookie('refreshToken',refreshToken,{
            httpOnly:true,
            secure:process.env.NODE_ENV === "production",
            sameSite:"strict",
            maxAge: 30 * 24 * 60 * 60 * 1000 
          });

          return res.json({
            success:true,
            message:"Admin Login Successfully",
            admin:{
                id:admin.id,
                name:admin.name,
                email:admin.email,
                role:admin.role,
                isActive:admin.isActive,
                lastLoginAt:admin.lastLoginAt
            }
          });




    }catch(e:any){
         return res.status(500).json({
            success:false,
            message:"Internal server error"
         });
    }

   }



}