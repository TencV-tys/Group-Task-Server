// socket/events.ts - COMPLETE WITH SWAP ADMIN EVENTS

// ========== SOCKET EVENT NAMES ==========
// Client -> Server events
export const CLIENT_EVENTS = {
  // Connection
  REGISTER: 'register',

  JOIN_GROUP: 'join-group',
  LEAVE_GROUP: 'leave-group',
  PING: 'ping',
  
  // Typing indicators
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  
  // Group chat
  SEND_MESSAGE: 'send-message',
  
  // Task updates
  TASK_STATUS_CHANGE: 'task:status-change'
} as const;

// Server -> Client events
export const SERVER_EVENTS = {
  // Connection
  REGISTERED: 'registered',
  ERROR: 'error',
  PONG: 'pong',
  
  // Task events
  TASK_CREATED: 'task:created',
  TASK_UPDATED: 'task:updated',
  TASK_DELETED: 'task:deleted', 
  TASK_ASSIGNED: 'task:assigned',
  
  // Assignment events
  ASSIGNMENT_CREATED: 'assignment:created',
  ASSIGNMENT_COMPLETED: 'assignment:completed',
  ASSIGNMENT_PENDING_VERIFICATION: 'assignment:pending-verification',
  ASSIGNMENT_VERIFIED: 'assignment:verified',
  ASSIGNMENT_REJECTED: 'assignment:rejected',
  ASSIGNMENT_UPDATED: 'assignment:updated',
  
  // Swap request events
  SWAP_REQUESTED: 'swap:requested',
  SWAP_CREATED: 'swap:created',
  SWAP_RESPONDED: 'swap:responded',
  SWAP_ACCEPTED: 'swap:accepted',
  SWAP_REJECTED: 'swap:rejected',
  SWAP_CANCELLED: 'swap:cancelled',
  SWAP_EXPIRED: 'swap:expired',
  
  // ===== NEW SWAP ADMIN EVENTS =====
  SWAP_PENDING_APPROVAL: 'swap:pending:approval',   // New swap awaiting admin approval
  SWAP_ADMIN_ACTION: 'swap:admin:action',           // Admin approved/rejected
  SWAP_READY_FOR_ACCEPTANCE: 'swap:ready:accept',   // Swap approved, ready for acceptance
  
  // Group events
  GROUP_MEMBER_JOINED: 'group:member-joined',
  GROUP_MEMBER_LEFT: 'group:member-left',
  GROUP_MEMBER_ROLE_CHANGED: 'group:member-role-changed',
  GROUP_UPDATED: 'group:updated',
  GROUP_CREATED: 'group:created',
  
  // Rotation events
  ROTATION_COMPLETED: 'rotation:completed',
  
  // Notification events
  NOTIFICATION_NEW: 'notification:new',
  
  // Typing indicators
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  
  // Chat messages
  NEW_MESSAGE: 'new-message'
} as const;

// ========== EVENT PAYLOAD TYPES ==========

// Task event payloads
export interface TaskCreatedPayload {
  task: any;
  createdBy: string;
  groupId: string;
}

export interface GroupCreatedPayload {
  groupId: string;
  groupName: string;
  userId: string;
  userName: string;
  userRole: string;
  createdAt: Date;
}

export interface TaskUpdatedPayload {
  task: any;
  updatedBy: string;
  groupId: string;
}

export interface TaskDeletedPayload {
  taskId: string;
  taskTitle: string;
  groupId: string;
  deletedBy: string;
}

export interface TaskAssignedPayload {
  taskId: string;
  taskTitle: string;
  assignedTo: string;
  assignedBy: string;
  groupId: string;
  dueDate: Date;
}

// Assignment event payloads
export interface AssignmentCreatedPayload {
  assignment: any;
  userId: string;
  groupId: string;
  taskTitle: string;
}

export interface AssignmentCompletedPayload {
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  completedBy: string;
  completedByName: string;
  groupId: string;
  isLate: boolean;
  finalPoints: number;
  photoUrl?: string;
}

export interface AssignmentPendingVerificationPayload {
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  userId: string;
  userName: string;
  groupId: string;
  photoUrl?: string;
  submittedAt: Date;
  isLate: boolean;
}

export interface AssignmentVerifiedPayload {
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  userId: string;
  userName: string;
  groupId: string;
  verified: boolean;
  verifiedBy: string;
  verifiedByName: string;
  points: number;
}

export interface AssignmentUpdatedPayload {
  assignmentId: string;
  userId: string;
  groupId: string;
  updatedBy: string;
  timestamp: Date;
}

// Swap request payloads
export interface SwapRequestedPayload {
  swapRequestId: string;
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  fromUserId: string;
  fromUserName: string;
  toUserId?: string;
  groupId: string;
  scope: 'week' | 'day';
  selectedDay?: string;
  selectedTimeSlotId?: string;
  reason?: string;
  expiresAt: Date;
}

export interface SwapRespondedPayload {
  swapRequestId: string;
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  fromUserId: string;
  toUserId: string;
  toUserName: string;
  groupId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  scope: 'week' | 'day';
  selectedDay?: string;
}

// ===== NEW SWAP ADMIN PAYLOADS =====

export interface SwapPendingApprovalPayload {
  swapRequestId: string;
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  fromUserId: string;
  fromUserName: string;
  toUserId?: string;
  groupId: string;
  scope: 'week' | 'day';
  selectedDay?: string;
  selectedTimeSlotId?: string;
  expiresAt: Date;
  requiresApproval: boolean;
}

export interface SwapAdminActionPayload {
  swapRequestId: string;
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  requesterId: string;
  adminId: string;
  adminName: string;
  groupId: string;
  action: 'APPROVED' | 'REJECTED';
  reason?: string;
  timestamp: Date;
}

export interface SwapReadyForAcceptancePayload {
  swapRequestId: string;
  assignmentId: string;
  taskId: string;
  taskTitle: string;
  requesterId: string;
  requesterName: string;
  groupId: string;
  scope: 'week' | 'day';
  selectedDay?: string;
  selectedTimeSlotId?: string;
  expiresAt: Date;
}

// Group event payloads
export interface GroupMemberJoinedPayload {
  groupId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  joinedAt: Date;
}

export interface GroupMemberLeftPayload {
  groupId: string;
  userId: string;
  userName: string;
}

export interface GroupMemberRoleChangedPayload {
  groupId: string;
  userId: string;
  userName: string;
  oldRole: string;
  newRole: string;
  changedBy: string;
  changedByName?: string;
}

// Rotation event payloads
export interface RotationCompletedPayload {
  groupId: string;
  newWeek: number;
  rotatedTasks: Array<{
    taskId: string;
    taskTitle: string;
    previousAssignee: string;
    newAssignee: string;
    newAssigneeName: string;
  }>;
  weekStart: Date;
  weekEnd: Date;
}

// Notification payload
export interface NotificationNewPayload {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  createdAt: Date;
}

// Typing payload
export interface TypingPayload {
  groupId: string;
  userId: string;
  userName: string;
}

// Message payload
export interface MessagePayload {
  groupId: string;
  messageId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  createdAt: Date;
}