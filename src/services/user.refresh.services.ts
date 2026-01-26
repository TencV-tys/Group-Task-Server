import { email, success } from "zod";
import { UserJwtUtils } from "../utils/user.jwtutils";
import { UserRefreshToken } from "./user.create.refreshToken.services";
import { access } from "node:fs";


export class UserRefreshServices{
       
    static async refreshUserToken(refreshToken:string){
              try{
                 
                const decoded = UserJwtUtils.verifyRefreshToken(refreshToken);

                const tokenData = await UserRefreshToken.findToken(refreshToken);
                  
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

                if(decoded.userId !== tokenData.userId){
                    return{
                        success:false,
                        message:"Token mismatch"
                    }
                }

                const user = tokenData.user;

                const newAccessToken = UserJwtUtils.generateToken(user.id,user.email,user.role);

                return{
                    success:true,
                    accessToken: newAccessToken,
                    user:{
                        id:user.id,
                        email:user.email,
                        fullName:user.fullName,
                        role:user.role
                    }

                }


              }catch(e:any){
                 return {
                    success:false,
                    message:e.message
                 }

              }
    }



}