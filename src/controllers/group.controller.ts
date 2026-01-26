
import { Request,Response } from "express";
import { GroupServices } from "../services/group.services";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { success } from "zod";
export class GroupController{
 
      static async createGroup(req:UserAuthRequest, res:Response){
          try{
              
            const userId = req.user?.id;

            if(!userId){
                return res.status(404).json({
                    success:false,
                    message:"User not authenticated"
                });
            }

            const {name} = req.body;
            
            if(!name || !name.trim()){
                return res.status(400).json({
                    success:false,
                    message:"Group name is required"
                });
            }

            const group = await GroupServices.createGroup(userId,name.trim());

             if(!group.success){
                return res.status(401).json({
                    success:false,
                    message:group.message
                })
             }

            return res.json({
                success:true,
                message:group.message,
                group:group
            })


          }catch(e:any){
              return res.status(500).json({
                success:false,
                message:"Internal server error"
              });

          }

      }
     
  


}