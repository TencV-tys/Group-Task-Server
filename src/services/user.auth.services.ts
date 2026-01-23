
import { UserRole, UserRoleStatus } from "@prisma/client";
import prisma from "../prisma";
import { UserAuthTypes } from "../types/user.auth";
export class UserServices{

 static async signup(email:string,name:string,password:string,avatarUrl?:string | null,phone?:string | null):Promise<UserAuthTypes>{
            try{
            
                 const userData:any = {
                        name:name,
                        email:email,
                        passwordHash:password,
                        avatarUrl:avatarUrl ?? null,
                        phone:phone ?? null,
                        role:UserRole.USER ,
                        roleStatus:UserRoleStatus.ACTIVE
                    }

                const user = await prisma.user.create({
                    data:userData
                });

                 return{
                    success:true,
                    message:"Sign up successfully",
                    user:{
                        id:user.id as string,
                        name:user.name,
                        email:user.email,
                        passwordHash:user.passwordHash,
                        avatarUrl:user.avatarUrl ?? undefined,
                        phone:user.phone ?? '',
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