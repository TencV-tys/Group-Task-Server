
import { UserRole, UserRoleStatus } from "@prisma/client";
import prisma from "../prisma";
import { UserAuthTypes } from "../types/user.auth";
export class UserServices{

 static async signup(email:string,name:string,password:string,avatarUrl?:string | null,phone?:string | null):Promise<UserAuthTypes>{
            try{
            
                const user = await prisma.user.create({
                    data:{
                         name:name,
                        email:email,
                        passwordHash:password,
                        avatarUrl:avatarUrl ?? null,
                        phone:phone ?? null,
                        role:UserRole.USER ,
                        roleStatus:UserRoleStatus.ACTIVE
                    
                    }
                });
                
                const userId = user.id as unknown as string;

                 return{
                    success:true,
                    message:"Sign up successfully",
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



}