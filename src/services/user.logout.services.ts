import { success } from "zod";
import { UserRefreshToken } from "./user.create.refreshToken.services";

export class UserLogoutServices{
   
    static async userLogout(refreshToken?:string, userId?:string){
          try{
                if(refreshToken){
                    await UserRefreshToken.revokedToken(refreshToken);
                }              
                  
                if(userId){
                    await UserRefreshToken.revokeAllUserTokens(userId);
                }

                return {
                    success:true,
                    message:"Logged out successfully"
                }

          }catch(e:any){
              return{
                success:false,
                message:e.message
              }
          }


    }


}