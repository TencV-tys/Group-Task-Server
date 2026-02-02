import { success } from "zod";
import prisma from "../prisma";

export class TaskService{
 
    static async createTask(userId:string, groupId:string, title:string, 
        description?:string, points:number = 1, 
        frequency:string = 'ONCE', category?:string){
      
            try{
               
                const membership = await prisma.groupMember.findFirst({
                    where:{
                        userId:userId,
                        groupId: groupId
                    }
                });

                if(!membership){
                    return{
                        success:false,
                        message: "You are not a member in this group"
                    };
                }

                if(membership.groupRole !== "ADMIN"){
                   return{
                    success:false,
                    message:"Only group admins can create tasks"
                   };
                }

                const group = await prisma.group.findUnique({
                    where:{ id: groupId}
                });

                if(!group){
                    return{
                        success:false,
                        message:"Group not found"
                    };

                }
                 
                if(!title || !title.trim()){
                    return{
                        success:false,
                        message:"Task title is required"
                    };
                }
               
                if(points < 1){
                    return{
                        success:false,
                        message:"Task points must be atleast 1"
                    };
                }

                const task = await prisma.task.create({
                    data:{
                        title: title.trim(),
                        description: description?.trim() || null,
                        points: points,
                        frequency: frequency,
                        category: category?.trim() || null,
                        groupId: groupId,
                        createdById: userId
                    },
                    include:{
                        group:{
                            select:{
                                id:true,
                                name:true,
                                description:true
                            }
                        },
                        creator:{
                            select:{
                                id:true,
                                fullName:true,
                                email:true
                            }
                        }
                    }
                });
                         
                return{
                    success:true,
                    message:"Task created successfully",
                    task:task
                };



            }catch(e:any){
                console.error('Error creating task : ',e.message);
                return{
                    success:false,
                    message:"Error creating task"
                }
            }


    }

    static async getGroupTasks(groupId:string, userId:string){
              try{
                   const membership = await prisma.groupMember.findFirst({
                    where:{
                        userId:userId,
                        groupId:groupId
                    }
                   });
                   
                   if(!membership){
                    return{
                        success:false,
                        message:"You are not a member in this group"
                    };
                   }

                   const tasks = await prisma.task.findMany({
                    where:{
                        groupId:groupId
                    },
                    include:{
                        creator:{
                            select:{
                                id:true,
                                fullName:true,
                                avatarUrl:true
                            }
                        },
                        assignments:{
                            where:{
                                userId:userId
                            },
                            select:{
                                id:true,
                                completed:true,
                                completedAt:true,
                                dueDate:true
                            }

                        },
                        _count:{
                            select:{
                                assignments:true
                            }
                        },
                        orderBy:{
                            createdAt:'desc'
                        }

                    }
                   });

                   const formattedTasks  = tasks.map(task =>({
                       id:task.id,
                       title: task.title,
                       description: task.description,
                       points: task.points,
                       frequency: task.frequency,
                      category: task.category,
                     createdAt: task.createdAt,
                     creator: task.creator,
                     // User's assignment if exists
                     userAssignment: task.assignments[0] || null,
                     // Stats
                     totalAssignments: task._count.assignments,
                     isAssignedToUser: task.assignments.length > 0
                   }));

                return {
                    success: true,
                    message: "Tasks retrieved successfully",
                    tasks: formattedTasks
                    };



              }catch(e:any){
                     console.error("TaskServices.getGroupTasks error:", e);
                     return {
                        success: false,
                        message: e.message || "Error retrieving tasks"
                        };

              }

    }

     // Get single task details
  static async getTaskDetails(taskId: string, userId: string) {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              description: true,
              members: {
                select: {
                  user: {
                    select: {
                      id: true,
                      fullName: true,
                      avatarUrl: true
                    }
                  },
                  groupRole: true
                }
              }
            }
          },
          creator: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true
            }
          },
          assignments: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  avatarUrl: true
                }
              }
            }
          }
        }
      });

      if (!task) {
        return {
          success: false,
          message: "Task not found"
        };
      }

      // Check if user is a member of the group
      const isMember = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: task.groupId
        }
      });

      if (!isMember) {
        return {
          success: false,
          message: "You are not a member of this group"
        };
      }

      // Find user's assignment
      const userAssignment = task.assignments.find(a => a.userId === userId);

      return {
        success: true,
        message: "Task details retrieved",
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          points: task.points,
          frequency: task.frequency,
          category: task.category,
          createdAt: task.createdAt,
          group: task.group,
          creator: task.creator,
          assignments: task.assignments,
          userAssignment: userAssignment || null,
          totalAssignments: task.assignments.length
        }
      };

    } catch (error: any) {
      console.error("TaskServices.getTaskDetails error:", error);
      return {
        success: false,
        message: error.message || "Error retrieving task details"
      };
    }
  }

    // Delete a task (admin only)
  static async deleteTask(taskId: string, userId: string) {
    try {
      // Get the task
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          group: true
        }
      });

      if (!task) {
        return {
          success: false,
          message: "Task not found"
        };
      }

      // Check if user is admin of the group
      const membership = await prisma.groupMember.findFirst({
        where: {
          userId: userId,
          groupId: task.groupId,
          groupRole: "ADMIN"
        }
      });

      if (!membership) {
        return {
          success: false,
          message: "Only group admins can delete tasks"
        };
      }

      // Delete the task (cascade will delete assignments)
      await prisma.task.delete({
        where: { id: taskId }
      });

      return {
        success: true,
        message: "Task deleted successfully"
      };

    } catch (error: any) {
      console.error("TaskServices.deleteTask error:", error);
      return {
        success: false,
        message: error.message || "Error deleting task"
      };
    }
  }

 static async updateTask(
  userId: string,
  taskId: string,
  data: {
    title?: string;
    description?: string;
    points?: number;
    frequency?: string;
    category?: string;
  }
) {
  try {
    if (!taskId) {
      return {
        success: false,
        message: "Task ID is required"
      };
    }

    // First, check if user can update this task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        group: true
      }
    });

    if (!task) {
      return {
        success: false,
        message: "Task not found"
      };
    }

    // Check if user is admin of the group
    const membership = await prisma.groupMember.findFirst({
      where: {
        userId: userId,
        groupId: task.groupId,
        groupRole: "ADMIN"
      }
    });

    if (!membership) {
      return {
        success: false,
        message: "Only group admins can update tasks"
      };
    }

    // Validate title if provided
    if (data.title && !data.title.trim()) {
      return {
        success: false,
        message: "Task title cannot be empty"
      };
    }

    // Validate points if provided
    if (data.points && data.points < 1) {
      return {
        success: false,
        message: "Task points must be at least 1"
      };
    }

    // Prepare update data
    const updateData: any = {};
    
    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined) {
      updateData.description = data.description.trim() || null;
    }
    if (data.points !== undefined) updateData.points = data.points;
    if (data.frequency !== undefined) updateData.frequency = data.frequency;
    if (data.category !== undefined) {
      updateData.category = data.category.trim() || null;
    }

    // Update the task
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        group: {
          select: {
            id: true,
            name: true
          }
        },
        creator: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    });

    return {
      success: true,
      message: "Task updated successfully",
      task: updatedTask
    };

  } catch (e: any) {
    console.error("TaskService.updateTask error:", e);
    return {
      success: false,
      message: e.message || "Error updating task"
    };
  }
}



}