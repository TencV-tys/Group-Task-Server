
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



}