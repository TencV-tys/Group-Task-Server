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
  static async isValidToken(token:string):Promise<boolean>{
      const refreshToken = await prisma.adminRefreshToken.findUnique({
        where:{token:token}
      });

      if(!refreshToken) return false;
      if(refreshToken.revoked) return false;
      if(refreshToken.expiresAt < new Date()) return false;

      return true;

  }


  static async deleteExpiredToken(){
    return prisma.adminRefreshToken.deleteMany({
        where:{
            expiresAt:{lt:new Date()}
        }
    });
  }


}