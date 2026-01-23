import jwt, { SignOptions } from 'jsonwebtoken';


export class UserJwtUtils{

    static generateToken(userId:string,email:string, role:string):string{
        const expiresIn = process.env.USER_JWT_EXPIRES_IN as SignOptions['expiresIn'];
        const secret = process.env.USER_JWT_SECRET as string;

        if(!expiresIn){
            throw new Error("USER EXPIRES IN not configured");
        }
        if(!secret){
            throw new Error("USER SECRET not configured");
        }

        return jwt.sign(
            {
              userId:userId,
              email:email,
              role:role
             },
             secret,
             {expiresIn: expiresIn}
        )

    }

   
    static generateRefreshToken(userId:string,email:string,role:string):string{
        const refresh = process.env.USER_JWT_REFRESH_SECRET as string;
        const expiresIn = process.env.USER_JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn']; 

        if(!refresh){
            throw new Error("admin refresh not configured");
        }
        if(!expiresIn){
            throw new Error("admin expires in not configiured");
        }

        return jwt.sign(
            {
                userId:userId,
                email:email,
                role:role,
                type:'refresh'
            },
            refresh,
            {expiresIn:expiresIn}
        );
    }


}