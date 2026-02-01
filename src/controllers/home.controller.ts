
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { Response } from "express";
import { HomeServices } from "../services/home.services";
import { success } from "zod";

export class HomeController{
         
    static async getHomeData(req:UserAuthRequest, res:Response){
          try{
            const userId = req.user?.id;

            if(!userId){
                return{
                    success:false,
                    message:"User not authenticated"
                }
            }

             const result = await HomeServices.getHomeData(userId);

             if(!result.success){
                return{
                     success:false,
                     message:result.message
                }
             }
               
             return res.json({
                success:true,
                message:result.message || "Home data retreived",
                data:result.data
             });
            
          }catch(e:any){
             return {
                success:false,
                message:"Internal server error"
             }
          }
    } 
 
}