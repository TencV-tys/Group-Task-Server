import prisma from "../prisma";

export class AdminRefreshToken{

   static async createAdminRefreshToken(adminId:string,token:string){
       const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 *1000);
       
       return prisma.adminRefreshToken.create({
        data:{
            adminId:adminId,
            token:token,
            expiresAt:expiresAt,
            type:"REFRESH"
        }
       });


   }

  static async findToken(token:string){
         
    return prisma.adminRefreshToken.findUnique({
        where:{token:token},
        include:{admin:true}
    });

  }
  
  static async revokedToken(token:string){
    
    return prisma.adminRefreshToken.update({
        where:{token:token},
        data:{revoked:true}
    });

  }

}