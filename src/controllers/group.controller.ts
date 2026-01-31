
import { Request,Response } from "express";
import { GroupServices } from "../services/group.services";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";
import { success } from "zod";
import { group } from "node:console";
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

            const {name, description} = req.body;
            
            if(!name || !name.trim()){
                return res.status(400).json({
                    success:false,
                    message:"Group name is required"
                });
            }
             

            const group = await GroupServices.createGroup(userId,name.trim(), description.trim());

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
     
  
      static async joinGroup(req:UserAuthRequest, res:Response){
        try{
            const userId = req.user?.id;

            if(!userId){
                return res.status(400).json({
                    success:false,
                    message:"User not authenticated"
                });
            }

            const {inviteCode} = req.body;

             if(!inviteCode || !inviteCode.trim()){
                return res.status(400).json({
                    success:false,
                    message:"Invite code is required"
                })
             }

            const join = await GroupServices.joinGroup(userId,inviteCode.trim());
              
            if(!join.success){
               return res.status(400).json({
                success:false,
                message:join.message
               })
            }

            return res.json({
                success:true,
                message:join.message,
                group:join.group,
                membership:join.membership
            })


        }catch(e:any){
            return res.status(500).json({
                success:false,
                message:"Internal server error"
            })
        }

      }


      static async getUserGroup(req:UserAuthRequest, res:Response){
             try{
                const userId = req.user?.id;
                
                if(!userId){
                    return res.status(400).json({
                        success:false,
                        message:"User is not authenticated"
                    });
                }

                const group = await GroupServices.getUserGroups(userId);

                if(!group.success){
                    return res.status(400).json({
                        success:false,
                        message:group.message
                    });
                }
                
                return res.json({
                    success:true,
                    message:group.message,
                    groups:group.groups
                });

             }catch(e:any){
                return res.status(500).json({
                    success:false,
                    message:"Internal server error"
                });

             }

      }
        

}