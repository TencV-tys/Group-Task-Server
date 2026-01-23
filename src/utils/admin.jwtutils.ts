import jwt, { SignOptions } from 'jsonwebtoken';

export class AdminJwtUtils{
 
       static generateToken(adminId:string,email:string,role:string):string{
            const secret = process.env.ADMIN_JWT_SECRET as string;
            const expiresIn = process.env.ADMIN_JWT_EXPIRES_IN as SignOptions['expiresIn'];
            
            if(!secret){
                throw new Error("admin secret is not configured");
            }
            if(!expiresIn){
                throw new Error("admin expires in is not configured");
            }
          
            return jwt.sign(
                {
                    adminId:adminId,
                    email:email,
                    role:role
                },
                secret,
                {expiresIn:expiresIn}
            );

       }

            static generateRefreshToken(adminId:string,email:string,role:string):string{
            const refresh = process.env.ADMIN_JWT_REFRESH_SECRET as string;
            const expiresIn = process.env.ADMIN_JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'];
            
            if(!refresh){
                throw new Error("admin refresh secret is not configured");
            }
            if(!expiresIn){
                throw new Error("admin refresh expires in is not configured");
            }
          
            return jwt.sign(
                {
                    adminId:adminId,
                    email:email,
                    role:role,
                    types:'refresh'
                },
                refresh,
                {expiresIn:expiresIn}
            );

       }


}