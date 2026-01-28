
import { success } from "zod";
import prisma from "../prisma";

export class GroupServices{

    static async createGroup(userId:string, groupName:string){
        
        try{
             const group = await prisma.group.create({
                data:{
                    name:groupName,
                    inviteCode:Math.random().toString(36).substring(2, 8).toUpperCase(),
                    createdById:userId
                }
             });

             const member = await prisma.groupMember.create({
                data:{
                    userId:userId,
                    groupId:group.id,
                    groupRole:"ADMIN"
                }
             });

             return{
                success:false,
                message:"Group Created!",
                group:group,
                inviteCode:group.inviteCode,
                adminMember:{
                    id:member.id,
                    groupRole:member.groupRole,
                    joinedAt:member.joinedAt
                }
             }

        }catch(error:any){
           console.error("ERROR creating group:", error);
      return {
        success: false,
        message: "Error creating group",
        error: error.message
      };

        }
    }

    static async joinGroup(userId:string, inviteCode:string){
         try{
            console.log(`User ${userId} trying to join with code: ${inviteCode}`);
            
            const group = await prisma.group.findUnique({
                where:{inviteCode :inviteCode.toUpperCase()}
            });

            if(!group){
                return{
                    success:false,
                    message:"Invalid invite code"
                }
            }


            const existingMember = await prisma.groupMember.findFirst({
                where:{
                    userId:userId,
                    groupId:group.id
                }
            });

            if(existingMember){
                return{
                    success:false,
                    message:"You are already a member of this group"

                }
            }

            const member = await prisma.groupMember.create({
                data:{
                    userId:userId,
                    groupId:group.id,
                    groupRole:"MEMBER"
                },
                include:{
                    group:{
                        select:{
                            id:true,
                            name:true,
                            description:true
                        }
                    }
                }
            });

             console.log(`User ${userId} joined group ${group.id} as MEMBER`);
            
             return{
                success:true,
                message:`Joined ${group.name} successfully`,
                group:member.group,
                membership:{
                    id:member.id,
                    role:member.groupRole,
                    joinedAt:member.joinedAt
                }
             }


         }catch(e:any){
             console.error("ERROR joining group:", e);
            return {
                success: false,
                message: "Error joining group",
                error: e.message
            };

         }


    }

}