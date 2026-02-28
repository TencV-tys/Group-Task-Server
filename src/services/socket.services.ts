import { getIO, emitToUser, emitToGroup, emitToUsers, emitToGroupExcept } from '../socket';
import { SERVER_EVENTS } from '../socket/events';
import {
  TaskCreatedPayload,
  TaskUpdatedPayload,
  TaskDeletedPayload,
  TaskAssignedPayload,
  AssignmentCompletedPayload,
  AssignmentPendingVerificationPayload,
  AssignmentVerifiedPayload,
  SwapRequestedPayload,
  SwapRespondedPayload,
  GroupMemberJoinedPayload,
  GroupMemberLeftPayload,
  GroupMemberRoleChangedPayload,
  RotationCompletedPayload,
  NotificationNewPayload,
  AssignmentCreatedPayload
} from '../socket/events';
import prisma from '../prisma';

export class SocketService {
  
  // ========== TASK EVENTS ==========
  
  static async emitTaskCreated(task: any, groupId: string, createdBy: string) {
    try {
      const payload: TaskCreatedPayload = {
        task,
        createdBy,
        groupId
      };
      
      emitToGroup(groupId, SERVER_EVENTS.TASK_CREATED, payload);
    } catch (error) {
      console.error('SocketService.emitTaskCreated error:', error);
    }
  }

  static async emitTaskUpdated(task: any, groupId: string, updatedBy: string) {
    try {
      const payload: TaskUpdatedPayload = {
        task,
        updatedBy,
        groupId
      };
      
      emitToGroup(groupId, SERVER_EVENTS.TASK_UPDATED, payload);
    } catch (error) {
      console.error('SocketService.emitTaskUpdated error:', error);
    }
  }

  static async emitTaskDeleted(taskId: string, taskTitle: string, groupId: string, deletedBy: string) {
    try {
      const payload: TaskDeletedPayload = {
        taskId,
        taskTitle,
        groupId,
        deletedBy
      };
      
      emitToGroup(groupId, SERVER_EVENTS.TASK_DELETED, payload);
    } catch (error) {
      console.error('SocketService.emitTaskDeleted error:', error);
    }
  }

  static async emitTaskAssigned(
    taskId: string, 
    taskTitle: string, 
    assignedTo: string, 
    assignedBy: string, 
    groupId: string, 
    dueDate: Date
  ) {
    try {
      const payload: TaskAssignedPayload = {
        taskId,
        taskTitle,
        assignedTo,
        assignedBy,
        groupId,
        dueDate
      };
      
      // Notify the assigned user
      emitToUser(assignedTo, SERVER_EVENTS.TASK_ASSIGNED, payload);
      
      // Notify the group
      emitToGroup(groupId, SERVER_EVENTS.TASK_ASSIGNED, {
        ...payload,
        assignedToName: await this.getUserName(assignedTo)
      });
    } catch (error) {
      console.error('SocketService.emitTaskAssigned error:', error);
    }
  }

  // ========== ASSIGNMENT EVENTS ==========

  static async emitAssignmentCreated(assignment: any, userId: string, groupId: string) {
    try {
      const payload: AssignmentCreatedPayload = {
        assignment,
        userId,
        groupId,
        taskTitle: assignment.task?.title || 'Task'
      };
      
      // Notify the assigned user
      emitToUser(userId, SERVER_EVENTS.ASSIGNMENT_CREATED, payload);
      
      // Notify the group
      emitToGroup(groupId, SERVER_EVENTS.ASSIGNMENT_CREATED, payload);
    } catch (error) {
      console.error('SocketService.emitAssignmentCreated error:', error);
    }
  }

  static async emitAssignmentCompleted(
    assignmentId: string,
    taskId: string,
    taskTitle: string,
    completedBy: string,
    completedByName: string,
    groupId: string,
    isLate: boolean,
    finalPoints: number,
    photoUrl?: string
  ) {
    try {
      const payload: AssignmentCompletedPayload = {
        assignmentId,
        taskId,
        taskTitle,
        completedBy,
        completedByName,
        groupId,
        isLate,
        finalPoints,
        photoUrl
      };
      
      // Notify all group members
      emitToGroup(groupId, SERVER_EVENTS.ASSIGNMENT_COMPLETED, payload);
    } catch (error) {
      console.error('SocketService.emitAssignmentCompleted error:', error);
    }
  }

  static async emitAssignmentPendingVerification(
    assignmentId: string,
    taskId: string,
    taskTitle: string,
    userId: string,
    userName: string,
    groupId: string,
    isLate: boolean,
    photoUrl?: string
  ) {
    try {
      const payload: AssignmentPendingVerificationPayload = {
        assignmentId,
        taskId,
        taskTitle,
        userId,
        userName,
        groupId,
        photoUrl,
        submittedAt: new Date(),
        isLate
      };
      
      // Get all admins in the group
      const admins = await prisma.groupMember.findMany({
        where: {
          groupId,
          groupRole: 'ADMIN',
          isActive: true
        },
        select: { userId: true }
      });
      
      // Notify all admins
      admins.forEach(admin => {
        emitToUser(admin.userId, SERVER_EVENTS.ASSIGNMENT_PENDING_VERIFICATION, payload);
      });
      
      // Also notify the group
      emitToGroup(groupId, SERVER_EVENTS.ASSIGNMENT_PENDING_VERIFICATION, payload);
    } catch (error) {
      console.error('SocketService.emitAssignmentPendingVerification error:', error);
    }
  }

  static async emitAssignmentVerified(
    assignmentId: string,
    taskId: string,
    taskTitle: string,
    userId: string,
    userName: string,
    groupId: string,
    verified: boolean,
    verifiedBy: string,
    verifiedByName: string,
    points: number
  ) {
    try {
      const payload: AssignmentVerifiedPayload = {
        assignmentId,
        taskId,
        taskTitle,
        userId,
        userName,
        groupId,
        verified,
        verifiedBy,
        verifiedByName,
        points
      };
      
      // Notify the user who submitted
      emitToUser(userId, verified ? SERVER_EVENTS.ASSIGNMENT_VERIFIED : SERVER_EVENTS.ASSIGNMENT_REJECTED, payload);
      
      // Notify the group
      emitToGroup(groupId, verified ? SERVER_EVENTS.ASSIGNMENT_VERIFIED : SERVER_EVENTS.ASSIGNMENT_REJECTED, payload);
    } catch (error) {
      console.error('SocketService.emitAssignmentVerified error:', error);
    }
  }

  // ========== SWAP REQUEST EVENTS ==========

  static async emitSwapRequested(
    swapRequestId: string,
    assignmentId: string,
    taskId: string,
    taskTitle: string,
    fromUserId: string,
    fromUserName: string,
    groupId: string,
    scope: 'week' | 'day',
    expiresAt: Date,
    toUserId?: string,
    selectedDay?: string,
    selectedTimeSlotId?: string,
    reason?: string
  ) {
    try {
      const payload: SwapRequestedPayload = {
        swapRequestId,
        assignmentId,
        taskId,
        taskTitle,
        fromUserId,
        fromUserName,
        toUserId,
        groupId,
        scope,
        selectedDay,
        selectedTimeSlotId,
        reason,
        expiresAt
      };
      
      if (toUserId) {
        // Notify specific user
        emitToUser(toUserId, SERVER_EVENTS.SWAP_REQUESTED, payload);
      } else {
        // Notify all group members except the requester
        emitToGroupExcept(groupId, fromUserId, SERVER_EVENTS.SWAP_REQUESTED, payload);
      }
      
      // Also notify the group about the new swap request
      emitToGroup(groupId, SERVER_EVENTS.SWAP_CREATED, payload);
    } catch (error) {
      console.error('SocketService.emitSwapRequested error:', error);
    }
  }

  static async emitSwapResponded(
    swapRequestId: string,
    assignmentId: string,
    taskId: string,
    taskTitle: string,
    fromUserId: string,
    toUserId: string,
    toUserName: string,
    groupId: string,
    status: 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED',
    scope: 'week' | 'day',
    selectedDay?: string
  ) {
    try {
      const payload: SwapRespondedPayload = {
        swapRequestId,
        assignmentId,
        taskId,
        taskTitle,
        fromUserId,
        toUserId,
        toUserName,
        groupId,
        status,
        scope,
        selectedDay
      };
      
      // Notify the requester
      emitToUser(fromUserId, SERVER_EVENTS.SWAP_RESPONDED, payload);
      
      // Notify the responder if it's not the same as requester
      if (toUserId !== fromUserId) {
        emitToUser(toUserId, SERVER_EVENTS.SWAP_RESPONDED, payload);
      }
      
      // Notify the group
      emitToGroup(groupId, SERVER_EVENTS.SWAP_RESPONDED, payload);
    } catch (error) {
      console.error('SocketService.emitSwapResponded error:', error);
    }
  }

  // ========== GROUP EVENTS ==========

  static async emitGroupMemberJoined(
    groupId: string,
    userId: string,
    userName: string,
    userAvatar?: string
  ) {
    try {
      const payload: GroupMemberJoinedPayload = {
        groupId,
        userId,
        userName,
        userAvatar,
        joinedAt: new Date()
      };
      
      emitToGroup(groupId, SERVER_EVENTS.GROUP_MEMBER_JOINED, payload);
    } catch (error) {
      console.error('SocketService.emitGroupMemberJoined error:', error);
    }
  }

  static async emitGroupMemberLeft(
    groupId: string,
    userId: string,
    userName: string
  ) {
    try {
      const payload: GroupMemberLeftPayload = {
        groupId,
        userId,
        userName
      };
      
      emitToGroup(groupId, SERVER_EVENTS.GROUP_MEMBER_LEFT, payload);
    } catch (error) {
      console.error('SocketService.emitGroupMemberLeft error:', error);
    }
  }

  static async emitGroupMemberRoleChanged(
    groupId: string,
    userId: string,
    userName: string,
    oldRole: string,
    newRole: string,
    changedBy: string
  ) {
    try {
      const payload: GroupMemberRoleChangedPayload = {
        groupId,
        userId,
        userName,
        oldRole,
        newRole,
        changedBy
      };
      
      emitToGroup(groupId, SERVER_EVENTS.GROUP_MEMBER_ROLE_CHANGED, payload);
    } catch (error) {
      console.error('SocketService.emitGroupMemberRoleChanged error:', error);
    }
  }

  // ========== ROTATION EVENTS ==========

  static async emitRotationCompleted(
    groupId: string,
    newWeek: number,
    rotatedTasks: any[],
    weekStart: Date,
    weekEnd: Date
  ) {
    try {
      const payload: RotationCompletedPayload = {
        groupId,
        newWeek,
        rotatedTasks,
        weekStart,
        weekEnd
      };
      
      emitToGroup(groupId, SERVER_EVENTS.ROTATION_COMPLETED, payload);
    } catch (error) {
      console.error('SocketService.emitRotationCompleted error:', error);
    }
  }

  // ========== NOTIFICATION EVENTS ==========

  static async emitNewNotification(
    userId: string,
    notificationId: string,
    type: string,
    title: string,
    message: string,
    data?: any
  ) {
    try {
      const payload: NotificationNewPayload = {
        notificationId,
        type,
        title,
        message,
        data,
        createdAt: new Date()
      };
      
      emitToUser(userId, SERVER_EVENTS.NOTIFICATION_NEW, payload);
    } catch (error) {
      console.error('SocketService.emitNewNotification error:', error);
    }
  }

  static async emitBulkNotifications(
    userIds: string[],
    notificationId: string,
    type: string,
    title: string,
    message: string,
    data?: any
  ) {
    try {
      const payload: NotificationNewPayload = {
        notificationId,
        type,
        title,
        message,
        data,
        createdAt: new Date()
      };
      
      emitToUsers(userIds, SERVER_EVENTS.NOTIFICATION_NEW, payload);
    } catch (error) {
      console.error('SocketService.emitBulkNotifications error:', error);
    }
  }

  // ========== HELPER METHODS ==========

  private static async getUserName(userId: string): Promise<string> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true }
      });
      return user?.fullName || 'Unknown User';
    } catch {
      return 'Unknown User';
    }
  }
}