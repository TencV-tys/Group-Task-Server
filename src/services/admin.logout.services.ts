
import { AdminRefreshToken } from "./admin.create.refreshToken.services";


export class AdminLogoutServices{

   static async adminLogout(refreshToken?:string, adminId?:string){
         try{
            
            if(refreshToken){
                await AdminRefreshToken.revokedToken(refreshToken);
            }

            if(adminId){
                await AdminRefreshToken.revokeAllAdminTokens(adminId);
            }

             return{
                success:false,
                message:"Logged out successfully"
             }

         }catch(e:any){
            
            return {
                success:false,
                message:e.message
            }
         }
   }


}