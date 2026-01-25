

import {Request,Response} from 'express';
import { UserServices } from '../services/user.auth.services';
import { UserRefreshToken } from '../services/user.create.refreshToken.services';
import { UserJwtUtils } from '../utils/user.jwtutils';

import { UserRefreshServices } from '../services/user.refresh.services';

import { UserLogoutServices } from '../services/user.logout.services';


export class UserAuthController{

    static async signup(req:Request, res:Response){
       try{
           const {name,email,password,avatarUrl,phone} = req.body;     
              
           const result = await UserServices.signup(email,name,password,avatarUrl,phone);
           
           if(!result.success || !result.user){
               return res.status(401).json({
                success:false,
                message: result.message || 'Authentication Failed'
               });
           }

           const user = result.user;
           const userRefreshToken = UserJwtUtils.generateRefreshToken(user.id,user.email,user.role);
             
           await UserRefreshToken.createRefreshToken(user.id,userRefreshToken);

           res.cookie('userToken',result.token,{
            httpOnly:true,
            secure:process.env.NODE_ENV === "production",
            sameSite:"strict",
            maxAge: 7 * 24 * 60 * 60 * 1000
           });
            
           res.cookie('userRefreshToken',userRefreshToken,{
            httpOnly:true,
            secure:process.env.NODE_ENV === "production",
            sameSite:"strict",
            maxAge: 30 * 24 * 60 * 60 * 1000 
           });
             
           return res.json({
              success:true,
              message:result.message,
              user:{
                id:user.id,
                email:user.email,
                name:user.name,
                avatarUrl:user.avatarUrl,
                phone:user.phone,
                role:user.role
              }
           });


       }catch(e:any){
          
        return res.status(500).json({
            success:false,
            message:e.message
        })
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

            const userRefreshToken = UserJwtUtils.generateRefreshToken(user.id,user.email,user.role);

              res.cookie('userToken',result.token,{
                httpOnly:true,
                secure:process.env.NODE_ENV === "production",
                sameSite:"strict",
                maxAge:7 * 24 * 60 * 60 * 1000
              });

              res.cookie('userRefreshToken',userRefreshToken,{
                httpOnly:true,
                secure:process.env.NODE_ENV === "production",
                sameSite:'strict',
                maxAge: 30 * 24 * 60 * 60 * 1000
              });
              
              await UserRefreshToken.createRefreshToken(user.id,userRefreshToken);

              return res.json({
                success:true,
                message:result.message,
                user:{
                    id:user.id,
                    name:user.name,
                    email:user.email,
                    avatarUrl:user.avatarUrl,
                    phone:user.phone,
                    role:user.role
                }
              });


        }catch(e:any){
              
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
                })
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

                 res.cookie('userToken',result.accessToken,{
                    httpOnly:true,
                    secure:process.env.NODE_ENV === "production",
                    sameSite:"strict",
                    maxAge: 15 * 60 * 1000
                 });

                 return res.json({
                    success:true,
                    message:"Token refreshed successfully",
                    accessToken: result.accessToken,
                    user:result.user
                 });

          }catch(e:any){
                // Clear cookies on error
            res.clearCookie('userToken');
            res.clearCookie('userRefreshToken');
            
            return res.status(500).json({
                success:false,
                message:"Token refresh failed"
            })
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
                    }catch(e){
                         console.error("Access token expired during logout");
                    }
                   }
                      
                   const result = await UserLogoutServices.userLogout(userRefreshToken,userId);

                   if(!result.success){
                    console.warn(`Logout service returned error: ${result.message}`);
                   }
                         
                 
               res.clearCookie('userToken');
               res.clearCookie('userRefreshToken');

               return res.json({
                success:false,
                message:""
               })
               


           }catch(e:any){
              console.error("Logout error:", e);
            
            // Still try to clear cookies even if error
            res.clearCookie('userToken');
            res.clearCookie('userRefreshToken');
            
            return res.status(500).json({
                success: false,
                message: "Logout failed"
            });
           }
     }


}