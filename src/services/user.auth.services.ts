import { UserJwtUtils } from './../utils/user.jwtutils';

import { UserRole, UserRoleStatus } from "@prisma/client";
import prisma from "../prisma";
import { UserSignUpAuthTypes, UserLoginAuthTypes } from "../types/user.auth";
import { comparePassword, hashedPassword } from "../utils/user.bcrypt";
export class UserServices{

 static async signup(email:string,name:string,password:string,avatarUrl?:string | null,phone?:string | null):Promise<UserSignUpAuthTypes>{
            try{
        
                if(!email || !password || !name ){
                    return{
                        success:false,
                        message:"All fields are required"
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
                         name:name,
                        email:email,
                        passwordHash:passwordHashed,
                        avatarUrl:avatarUrl ?? null,
                        phone:phone ?? null,
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
                        name:user.name,
                        email:user.email,
                        passwordHash:user.passwordHash,
                        avatarUrl:user.avatarUrl,
                        phone:user.phone,
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
                name:user.name,
                email:user.email,
                avatarUrl:user.avatarUrl,
                phone:user.phone,
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