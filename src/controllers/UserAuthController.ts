import {Request,Response} from 'express';
import { UserServices } from '../services/user.auth.services';
import { UserRefreshToken } from '../services/user.refreshToken';
import { UserJwtUtils } from '../utils/user.jwtutils';
import { success } from 'zod';


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
           const refreshToken = UserJwtUtils.generateRefreshToken(user.id,user.email,user.role);
             
           await UserRefreshToken.createRefreshToken(user.id,refreshToken);

           res.cookie('userToken',result.token,{
            httpOnly:true,
            secure:process.env.NODE_ENV === "production",
            sameSite:"strict",
            maxAge: 7 * 24 * 60 * 60 * 1000
           });
            
           res.cookie('refreshToken',refreshToken,{
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

            const refreshToken = UserJwtUtils.generateRefreshToken(user.id,user.email,user.role);

              res.cookie('userToken',result.token,{
                httpOnly:true,
                secure:process.env.NODE_ENV === "production",
                sameSite:"strict",
                maxAge:7 * 24 * 60 * 60 * 1000
              });

              res.cookie('refreshToken',refreshToken,{
                httpOnly:true,
                secure:process.env.NODE_ENV === "production",
                sameSite:'strict',
                maxAge: 30 * 24 * 60 * 60 * 1000
              });
              
              await UserRefreshToken.createRefreshToken(user.id,refreshToken);

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


}