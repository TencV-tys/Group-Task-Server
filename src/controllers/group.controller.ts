
import { Request,Response } from "express";
import { GroupServices } from "../services/group.services";
import { UserAuthRequest } from "../middlewares/user.auth.middleware";

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
        
// Get group members with rotation info
static async getGroupMembersWithRotation(req: UserAuthRequest, res: Response) {
    try {
        const userId = req.user?.id;
        const { groupId } = req.params as {groupId:string};

        if (!userId || !groupId) {
            return res.status(400).json({
                success: false,
                message: "User ID and Group ID are required"
            });
        }

        const result = await GroupServices.getGroupMembersWithRotation(groupId, userId);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message
            });
        }

        return res.json({
            success: true,
            message: result.message,
            group: result.group,
            members: result.members
        });

    } catch (error: any) {
        console.error("GroupController.getGroupMembersWithRotation error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
}

// Update member rotation order
static async updateMemberRotation(req: UserAuthRequest, res: Response) {
    try {
        const userId = req.user?.id;
        const { groupId, memberId } = req.params as {groupId:string,memberId:string};
        const { rotationOrder, isActive } = req.body;

        if (!userId || !groupId || !memberId) {
            return res.status(400).json({
                success: false,
                message: "User ID, Group ID, and Member ID are required"
            });
        }

        const result = await GroupServices.updateMemberRotation(
            userId,
            groupId,
            memberId,
            rotationOrder,
            isActive
        );

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message
            });
        }

        return res.json({
            success: true,
            message: result.message,
            member: result.member
        });

    } catch (error: any) {
        console.error("GroupController.updateMemberRotation error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
}

// Reorder rotation sequence
static async reorderRotationSequence(req: UserAuthRequest, res: Response) {
    try {
        const userId = req.user?.id;
        const { groupId } = req.params as {groupId:string};
        const { newOrder } = req.body; // Array of { memberId, rotationOrder }

        if (!userId || !groupId || !newOrder || !Array.isArray(newOrder)) {
            return res.status(400).json({
                success: false,
                message: "User ID, Group ID, and new order array are required"
            });
        }

        const result = await GroupServices.reorderRotationSequence(userId, groupId, newOrder);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message
            });
        }

        return res.json({
            success: true,
            message: result.message
        });

    } catch (error: any) {
        console.error("GroupController.reorderRotationSequence error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
}

// Get rotation schedule preview
static async getRotationSchedulePreview(req: UserAuthRequest, res: Response) {
    try {
        const userId = req.user?.id;
        const { groupId } = req.params as {groupId:string};
        const { weeks = 4 } = req.query;

        if (!userId || !groupId) {
            return res.status(400).json({
                success: false,
                message: "User ID and Group ID are required"
            });
        }

        const result = await GroupServices.getRotationSchedulePreview(
            groupId,
            userId,
            parseInt(weeks as string)
        );

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message
            });
        }
 
        return res.json({
            success: true,
            message: result.message,
            currentWeek: result.currentWeek,
            activeMembers: result.activeMembers,
            tasks: result.tasks,
            schedule: result.schedule
        });

    } catch (error: any) {
        console.error("GroupController.getRotationSchedulePreview error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
}


static async getGroupInfo(req: UserAuthRequest, res: Response) {
    try {
      const { groupId } = req.params as {groupId:string};
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const result = await GroupServices.getGroupInfo(groupId, userId);
      
      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error: any) {
      console.error('Group info error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error getting group info'
      });
    }
  }

  // Update group (name, description) - keep this
  static async updateGroup(req: UserAuthRequest, res: Response) {
    try {
      const { groupId } = req.params as {groupId:string};
      const userId = req.user?.id;
      const { name, description } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const result = await GroupServices.updateGroup(groupId, userId, {
        name,
        description
      });
      
      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error: any) {
      console.error('Update group error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error updating group'
      });
    }
  }


}