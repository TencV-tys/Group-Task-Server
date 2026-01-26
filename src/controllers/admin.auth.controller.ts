
import { AdminAuthServices } from "../services/admin.auth.services";
import { Request,Response } from "express";
import { AdminJwtUtils } from "../utils/admin.jwtutils";
import { AdminRefreshToken } from "../services/admin.create.refreshToken.services";
import { AdminRefreshServices } from "../services/admin.refresh.services";

import { AdminLogoutServices } from '../services/admin.logout.services';
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

          const adminRefreshToken = await AdminJwtUtils.generateRefreshToken(admin.id,admin.email,admin.role);
              
          await AdminRefreshToken.createAdminRefreshToken(admin.id,adminRefreshToken);

          res.cookie('adminToken',result.token,{
            httpOnly:true,
            secure:process.env.NODE_ENV === "production",
            sameSite:"strict",
            maxAge:7 * 24 * 60 *60 * 1000
          });

          res.cookie('adminRefreshToken',adminRefreshToken,{
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
                fullName:admin.fullName,
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

   static async refreshToken(req:Request,res:Response){
    try{
       const adminRefreshToken = req.cookies.adminRefreshToken;

        if(!adminRefreshToken){
                return res.status(400).json({ 
                    success:false,
                    message:"Refresh token required"
                })
            }

            const result = await AdminRefreshServices.refreshAdminToken(adminRefreshToken);

            if(!result.success){
              res.clearCookie('adminToken');
              res.clearCookie('adminRefreshToken');

                  return res.status(401).json({
                        success:false,
                        message:result.message
                    });
            }

            res.cookie('adminToken',result.newAccessToken,{
               httpOnly:true,
               secure:process.env.NODE_ENV === "production",
               sameSite:"strict",
               maxAge: 15 * 60 * 1000
            });
            
            return res.json({
              success:true,
              message:"Token refreshed successfully",
              accessToken: result.newAccessToken,
              admin: result.admin
            });

    }catch(e:any){
                 res.clearCookie('adminToken');
            res.clearCookie('adminRefreshToken');
            
            return res.status(500).json({
                success:false,
                message:"Token refresh failed"
            })

    }

   }

   static async logout(req:Request,res:Response){
         try{
            const refreshToken = req.cookies.adminRefreshToken;
            
            let adminId: string | undefined;

            const accessToken = req.cookies.adminToken;

            if(accessToken){
              try{
                  const decoded = AdminJwtUtils.verifyToken(accessToken);
                  adminId = decoded.adminId;
              }catch(e:any){
                      console.error("Access token expired during logout");
              }
            }
           
            const result = await AdminLogoutServices.adminLogout(refreshToken,adminId);

            res.clearCookie('adminToken');
            res.clearCookie('adminRefreshToken');

            return res.json({
              success:true,
              message:"Admin logged out successfully"
            });



         }catch(e:any){
             console.error("Admin logout error:", e);
            
            // Still clear cookies
            res.clearCookie('adminToken');
            res.clearCookie('adminRefreshToken');
            
            return res.status(500).json({
                success: false,
                message: "Logout failed"
            });
         }

   }


}