import prisma from "../prisma";
import { AdminLoginAuthTypes } from "../types/admin.auth";
import { AdminJwtUtils } from "../utils/admin.jwtutils";
import { comparePassword } from "../utils/shared.bcrypt";


export class AdminAuthServices{

  static async login(email:string,password:string):Promise<AdminLoginAuthTypes>{
             try{
                 
                if(!email || !password){
                    return{
                        success:false,
                        message:"All fields are required"
                    }
                }
                  
                const admin = await prisma.systemAdmin.findUnique({
                    where:{email}
                });
                  
                if(!admin){
                    return{
                        success:false,
                        message:"Admin not found"
                    }
                }
                  
                 // Check if admin is active
            if (!admin.isActive) {
                return {
                    success: false,
                    message: "Admin account is deactivated"
                };
            }
            
                const validAdminPassword = await comparePassword(password, admin?.passwordHash);
             
                 if(!validAdminPassword){
                    return{
                        success:false,
                        message:"Invalid password"
                    }
                 }

                 const token = AdminJwtUtils.generateToken(admin.id,admin.email,admin.role);
                  
                 await prisma.systemAdmin.update({
                    where:{id:admin.id},
                    data:{lastLoginAt:new Date()}
                 })

                 return{
                     success:true,
                     message:"Login Successfully",
                     token,
                     admin:{
                        id:admin.id,
                        name:admin.name,
                        email:admin.email,
                        role:admin.role,
                        isActive:admin.isActive,
                        lastLoginAt:admin.lastLoginAt
                     }

                 }
                  


             }catch(e:any){
                return{
                    success:false,
                    message:e.message
                }
             }        
  }

}