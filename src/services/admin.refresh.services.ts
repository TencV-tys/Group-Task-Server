
import { email, success } from "zod";
import { AdminJwtUtils } from "../utils/admin.jwtutils";
import { AdminRefreshToken } from "./admin.create.refreshToken.services";


export class AdminRefreshServices{

      static async refreshAdminToken(refreshToken:string){
             try{
                const decoded = AdminJwtUtils.verifyRefreshToken(refreshToken);
                
                const tokenData = await AdminRefreshToken.findToken(refreshToken);

                if(!tokenData){
                    return {
                        success:false,
                        message:"Invalid refresh token"
                    }
                }

                if(tokenData.revoked){
                    return{
                        success:false,
                         message:"Refresh token revoked"
                    }
                }
                  
                if(tokenData.expiresAt < new Date()){
                    return{
                        success:false,
                        message:"Refresh token expired"
                    }
                }

                if(decoded.adminId !== tokenData.adminId){
                    return{
                        success:false,
                        message:"Token mismatch"
                    }
                }

                const admin = tokenData.admin;

                const newAccessToken = AdminJwtUtils.generateToken(admin.id,admin.email,admin.role);
                
                return{
                    success:true,
                    newAccessToken,
                    admin:{
                        id:admin.id,
                        fullName:admin.fullName,
                        email:admin.email,
                        role:admin.role
                    }
                };


             }catch(e:any){
                return{
                    success:false,
                    message:e.message
                }


             }
          

      }


}