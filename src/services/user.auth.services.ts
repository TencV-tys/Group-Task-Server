

import { UserJwtUtils } from './../utils/user.jwtutils';

import { UserRole, UserRoleStatus,Gender } from "@prisma/client";
import prisma from "../prisma";
import { UserSignUpAuthTypes, UserLoginAuthTypes } from "../types/user.auth";
import { comparePassword, hashedPassword } from "../utils/shared.bcrypt";
export class UserServices{

 static async signup(email:string,fullName:string,password:string,confirmPassword:string,avatarUrl?:string | null,gender?:Gender | null):Promise<UserSignUpAuthTypes>{
            try{
        
                if(!email || !password || !confirmPassword || !fullName ){
                    return{
                        success:false,
                        message:"All fields are required"
                    }
                }

             if(password !== confirmPassword){
                return{
                    success:false,
                    message:"Please confirm your password"
                }
             }
               
                const existingUser = await prisma.user.findUnique({
                    where:{email}
                });

                if(existingUser){
                       return{
                        success:false,
                        message:"Email found"
                       }
                }
                
                const passwordHashed = await hashedPassword(password,10);

                const user = await prisma.user.create({
                    data:{
                        fullName:fullName,
                        email:email,
                        passwordHash:passwordHashed,
                        avatarUrl:avatarUrl ?? null,
                        gender:gender ?? null, 
                        role:UserRole.USER ,
                        roleStatus:UserRoleStatus.ACTIVE
                    
                    }
                });
                
                const userId = user.id as unknown as string;
                const token = UserJwtUtils.generateToken(userId,user.email,user.role);

                 return{
                    success:true,
                    message:"Sign up successfully",
                    token,
                    user:{
                        id:userId,
                        fullName:user.fullName,
                        email:user.email,
                        passwordHash:user.passwordHash,
                        avatarUrl:user.avatarUrl,
                        gender:user.gender,
                        role: user.role,
                        roleStatus: user.roleStatus
                    }
                 }  

            }catch(e:any){
                return{
                    success:false,
                    message:"Sign up failed",
                    error:e.message
                }
            } 
      

 }



 static async login(email:string,password:string):Promise<UserLoginAuthTypes>{
     try{
            
            if(!email || !password){
                return{
                    success:false,
                    message:"All fields are required"
                }
            }

        const user = await prisma.user.findUnique({
            where:{email}
        });

        if(!user){
            return{
                success:false,
                message:"User not found"
            }
        } 
         
        const validPassword = await comparePassword(password,user.passwordHash);
          
        if(!validPassword){
            return{
                success:false,
                message:"Invalid Password"
            }
        }

        const userId = user.id as unknown as string;
        const token = UserJwtUtils.generateToken(userId,user.email,user.role);
          return{
             success:true,
             message:"Login Successfully",
             token,
             user:{
                id:userId,
                fullName:user.fullName,
                email:user.email,
                avatarUrl:user.avatarUrl,
                gender:user.gender,
                role:user.role,
                roleStatus:user.roleStatus
             }
          }

     }catch(e:any){
        return{
            success:false,
            message:"Login Failed",
            error:e.message
        }
     }  

 }

}