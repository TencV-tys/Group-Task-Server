import prisma from "../prisma";

export class UserRefreshToken{

    static async createRefreshToken(userId:string, token:string){
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        return prisma.refreshToken.create({
            data:{
                userId:userId,
                token:token,
                expiresAt:expiresAt,
                type:"REFRESH"
            }
        });

    }
   
    static async findToken(token:string){
            return prisma.refreshToken.findUnique({
                where:{token:token},
                include:{user:true}
            });

    }
         
      // REVOKE all tokens for a user
    static async revokeAllUserTokens(userId: string) {
        return prisma.refreshToken.updateMany({
            where: { 
                userId: userId,
                revoked: false 
            },
            data: { revoked: true }
        });
    }



     static async revokedToken(token:string){
        return prisma.refreshToken.update({
            where:{token:token},
            data:{revoked:true}
        });
     }
   
     static async isValidToken(token:string):Promise<boolean>{
             const refreshToken = await prisma.refreshToken.findUnique({
                where:{token:token}
             });

             if(!refreshToken) return false;
             if(refreshToken.revoked) return false;
             if(refreshToken.expiresAt < new Date()) return false;

             return true;

     }

     static async deleteExpireTokens(){
               return prisma.refreshToken.deleteMany({
                where: {
                     expiresAt: {lt:new Date()}
                      }
               });      
     } 

}