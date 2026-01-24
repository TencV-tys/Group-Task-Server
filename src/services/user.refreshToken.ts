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

     static async revokedToken(token:string){
        return prisma.refreshToken.update({
            where:{token:token},
            data:{revoked:true}
        });
     }

}