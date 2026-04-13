
// services/socket.services.ts - COMPLETE WITH SWAP ADMIN METHODS

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
  AssignmentCreatedPayload,
  GroupCreatedPayload
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
      
      emitToUser(assignedTo, SERVER_EVENTS.TASK_ASSIGNED, payload);
      
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
      
      emitToUser(userId, SERVER_EVENTS.ASSIGNMENT_CREATED, payload);
      emitToGroup(groupId, SERVER_EVENTS.ASSIGNMENT_CREATED, payload);
    } catch (error) {
      console.error('SocketService.emitAssignmentCreated error:', error);
    }
  }
  
  static async emitAssignmentUpdated(
    assignmentId: string,
    userId: string,
    groupId: string,
    updatedBy?: string
  ) {
    try {
      const payload = {
        assignmentId,
        userId,
        groupId,
        updatedBy: updatedBy || userId, 
        timestamp: new Date()
      };
      
      emitToUser(userId, SERVER_EVENTS.ASSIGNMENT_UPDATED, payload);
      emitToGroup(groupId, SERVER_EVENTS.ASSIGNMENT_UPDATED, payload);
      
      console.log(`📢 Emitted assignment:updated to user ${userId} and group ${groupId}`);
    } catch (error) {
      console.error('SocketService.emitAssignmentUpdated error:', error);
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
    
    // Define the type for admin members
    interface AdminMember {
      userId: string;
    }
    
    const admins = await prisma.groupMember.findMany({
      where: {
        groupId,
        groupRole: 'ADMIN',
        isActive: true
      },
      select: { userId: true }
    });
    
    // Type the admin parameter explicitly
    admins.forEach((admin: AdminMember) => {
      emitToUser(admin.userId, SERVER_EVENTS.ASSIGNMENT_PENDING_VERIFICATION, payload);
    });
    
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
      
      emitToUser(userId, verified ? SERVER_EVENTS.ASSIGNMENT_VERIFIED : SERVER_EVENTS.ASSIGNMENT_REJECTED, payload);
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
        emitToUser(toUserId, SERVER_EVENTS.SWAP_REQUESTED, payload);
      } else {
        emitToGroupExcept(groupId, fromUserId, SERVER_EVENTS.SWAP_REQUESTED, payload);
      }
      
      emitToGroup(groupId, SERVER_EVENTS.SWAP_CREATED, payload);
    } catch (error) {
      console.error('SocketService.emitSwapRequested error:', error);
    }
  }

  // NEW: Emit swap pending approval event (for admin approval workflow)
  static async emitSwapPendingApproval(
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
    selectedTimeSlotId?: string
  ) {
    try {
      const payload = {
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
        expiresAt,
        requiresApproval: true
      };
      
      // Notify all admins in the group
      const admins = await prisma.groupMember.findMany({
        where: {
          groupId,
          groupRole: "ADMIN",
          isActive: true
        },
        select: { userId: true }
      }); 
      
      for (const admin of admins) {
        emitToUser(admin.userId, SERVER_EVENTS.SWAP_PENDING_APPROVAL, payload);
      }
      
      // Notify the group about pending approval
      emitToGroup(groupId, SERVER_EVENTS.SWAP_PENDING_APPROVAL, payload);
      
      console.log(`📢 Emitted swap pending approval for request ${swapRequestId} to ${admins.length} admins`);
    } catch (error) {
      console.error('SocketService.emitSwapPendingApproval error:', error);
    }
  }

  // NEW: Emit swap admin action (approved/rejected)
  static async emitSwapAdminAction(
    swapRequestId: string,
    assignmentId: string,
    taskId: string,
    taskTitle: string,
    requesterId: string,
    adminId: string,
    adminName: string,
    groupId: string,
    action: 'APPROVED' | 'REJECTED',
    reason?: string
  ) {
    try {
      const payload = {
        swapRequestId,
        assignmentId,
        taskId,
        taskTitle,
        requesterId,
        adminId,
        adminName,
        groupId,
        action,
        reason,
        timestamp: new Date()
      };
      
      // Notify the requester
      emitToUser(requesterId, SERVER_EVENTS.SWAP_ADMIN_ACTION, payload);
      
      // Notify the group
      emitToGroup(groupId, SERVER_EVENTS.SWAP_ADMIN_ACTION, payload);
      
      console.log(`📢 Admin ${adminName} ${action} swap request ${swapRequestId}`);
    } catch (error) {
      console.error('SocketService.emitSwapAdminAction error:', error);
    }
  }

// In socket.services.ts - Update the emitSwapResponded method

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
  scope: 'week' | 'day' | 'cross',  // ✅ ADD 'cross' here
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
    
    emitToUser(fromUserId, SERVER_EVENTS.SWAP_RESPONDED, payload);
    
    if (toUserId !== fromUserId) {
      emitToUser(toUserId, SERVER_EVENTS.SWAP_RESPONDED, payload);
    }
    
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
    changedBy: string,
    changedByName?: string
  ) {
    try {
      const payload = {
        groupId,
        userId,
        userName,
        oldRole,
        newRole,
        changedBy,
        changedByName: changedByName || 'Admin'
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
      console.log(`📢 Emitted rotation completed for group ${groupId} to week ${newWeek}`);
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

  static async emitGroupCreated(
    groupId: string,
    groupName: string,
    userId: string,
    userName: string,
    userRole: string
  ) {
    try {
      const payload: GroupCreatedPayload = {
        groupId,
        groupName,
        userId,
        userName,
        userRole,
        createdAt: new Date()
      };
      
      emitToUser(userId, SERVER_EVENTS.GROUP_CREATED, payload);
      console.log(`📢 Emitted group created event to user ${userName}`);
    } catch (error) {
      console.error('SocketService.emitGroupCreated error:', error);
    }
  }


  static async emitNewFeedbackReceived(
    adminIds: string[],
    feedbackId: string,
    type: string,
    userName: string,
    message: string,
    createdAt: Date
  ) {
    try {
      const payload = {
        feedbackId,
        type,
        userName,
        message: message.substring(0, 100),
        createdAt
      };
      
      emitToUsers(adminIds, 'NEW_FEEDBACK_RECEIVED', payload);
      console.log(`📢 Emitted new feedback to ${adminIds.length} admins`);
    } catch (error) {
      console.error('SocketService.emitNewFeedbackReceived error:', error);
    }
  }

  static async emitFeedbackStatusChanged(
    adminIds: string[],
    feedbackId: string,
    userId: string,
    oldStatus: string,
    newStatus: string
  ) {
    try {
      const payload = {
        feedbackId,
        userId,
        oldStatus,
        newStatus,
        updatedAt: new Date()
      };
      
      emitToUsers(adminIds, 'FEEDBACK_STATUS_CHANGED', payload);
      console.log(`📢 Emitted feedback status change to ${adminIds.length} admins`);
    } catch (error) {
      console.error('SocketService.emitFeedbackStatusChanged error:', error);
    }
  }

  static async emitFeedbackUpdated(
    adminIds: string[],
    feedbackId: string,
    userId: string,
    userName: string,
    type: string,
    message: string
  ) {
    try {
      const payload = {
        feedbackId, 
        userId,
        userName,
        type,
        message: message.substring(0, 100), 
        updatedAt: new Date() 
      };
      
      emitToUsers(adminIds, 'FEEDBACK_UPDATED', payload);
      console.log(`📢 Emitted feedback update to ${adminIds.length} admins`);
    } catch (error) {
      console.error('SocketService.emitFeedbackUpdated error:', error);
    }
  }

  static async emitFeedbackDeleted(
    adminIds: string[],
    feedbackId: string,
    userId: string,
    userName: string,
    type: string
  ) {
    try {
      const payload = {
        feedbackId,
        userId,
        userName,
        type,
        deletedAt: new Date()
      };
      
      emitToUsers(adminIds, 'FEEDBACK_DELETED', payload);
      console.log(`📢 Emitted feedback deletion to ${adminIds.length} admins`);
    } catch (error) {
      console.error('SocketService.emitFeedbackDeleted error:', error);
    }
  }

    static async emitNewReportReceived(
    adminIds: string[],
    reportId: string,
    groupId: string,
    groupName: string,
    reporterId: string,
    reporterName: string,
    reportType: string,
    description: string,
    createdAt: Date
  ) {
    try {
      const payload = {
        reportId,
        groupId,
        groupName,
        reporterId,
        reporterName,
        reportType,
        description: description.substring(0, 200),
        createdAt
      };
      
      emitToUsers(adminIds, 'report:new', payload);
      console.log(`📢 Emitted new report to ${adminIds.length} admins`);
    } catch (error) {
      console.error('SocketService.emitNewReportReceived error:', error);
    }
  }

  static async emitReportStatusChanged(
    reporterId: string,
    reportId: string,
    groupId: string,
    groupName: string,
    oldStatus: string,
    newStatus: string,
    resolvedBy: string,
    resolutionNotes?: string
  ) {
    try {
      const payload = {
        reportId,
        groupId,
        groupName,
        oldStatus,
        newStatus,
        resolvedBy,
        resolutionNotes: resolutionNotes || null,
        resolvedAt: new Date()
      };
      
      // Notify the reporter
      emitToUser(reporterId, 'report:status', payload);
      console.log(`📢 Emitted report status change to reporter ${reporterId}`);
    } catch (error) {
      console.error('SocketService.emitReportStatusChanged error:', error);
    }
  }

  static async emitReportStatusChangedToAdmins(
    adminIds: string[],
    reportId: string,
    groupId: string,
    groupName: string,
    reporterId: string,
    reporterName: string,
    oldStatus: string,
    newStatus: string,
    resolvedBy: string,
    resolutionNotes?: string
  ) {
    try {
      const payload = {
        reportId,
        groupId,
        groupName,
        reporterId,
        reporterName,
        oldStatus,
        newStatus,
        resolvedBy,
        resolutionNotes: resolutionNotes || null,
        resolvedAt: new Date()
      };
      
      emitToUsers(adminIds, 'report:status', payload);
      console.log(`📢 Emitted report status change to ${adminIds.length} admins`);
    } catch (error) {
      console.error('SocketService.emitReportStatusChangedToAdmins error:', error);
    }
  }
}