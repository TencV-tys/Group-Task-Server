import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { UserJwtUtils } from '../utils/user.jwtutils';
import { AdminJwtUtils } from '../utils/admin.jwtutils';
import prisma from '../prisma';

// Store connected users
interface ConnectedUser {
  socketId: string;
  userId: string;
  userType: 'user' | 'admin';
  groups: string[];
}

const connectedUsers = new Map<string, ConnectedUser>();

export const setupSocketIO = (server: HttpServer) => {
  const io = new SocketServer(server, {
    cors: {
      origin: true,
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const tokenString = token.replace('Bearer ', '');
      
      // Try user token first
      try {
        const decoded = UserJwtUtils.verifyToken(tokenString);
        socket.data.userId = decoded.userId;
        socket.data.userType = 'user';
        socket.data.email = decoded.email;
        socket.data.role = decoded.role;
        console.log(`✅ Socket authenticated as user: ${decoded.userId}`);
        return next();
      } catch (userError) {
        // Try admin token
        try {
          const decoded = AdminJwtUtils.verifyToken(tokenString);
          socket.data.userId = decoded.adminId;
          socket.data.userType = 'admin';
          socket.data.email = decoded.email;
          socket.data.role = decoded.role;
          console.log(`✅ Socket authenticated as admin: ${decoded.adminId}`);
          return next();
        } catch (adminError) {
          console.error('❌ Socket auth failed:', adminError);
          return next(new Error('Invalid token'));
        }
      }
    } catch (error) {
      console.error('❌ Socket auth error:', error);
      return next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`🔌 New socket connection: ${socket.id} - User: ${socket.data.userId} (${socket.data.userType})`);

    try {
      // Get user's groups from database
      let groups: string[] = [];
      
      if (socket.data.userType === 'user') {
        const memberships = await prisma.groupMember.findMany({
          where: { 
            userId: socket.data.userId,
            isActive: true 
          },
          select: { groupId: true }
        });
        groups = memberships.map(m => m.groupId);
      }

      // Store user connection
      connectedUsers.set(socket.id, {
        socketId: socket.id,
        userId: socket.data.userId,
        userType: socket.data.userType,
        groups
      });

      // Join user to their personal room
      socket.join(`user:${socket.data.userId}`);

      // Join user to their group rooms
      groups.forEach(groupId => {
        socket.join(`group:${groupId}`);
      });

      // Send registration confirmation
      socket.emit('registered', {
        success: true,
        message: 'Connected to real-time server',
        userId: socket.data.userId,
        userType: socket.data.userType,
        groups,
        socketId: socket.id
      });

      console.log(`✅ User ${socket.data.userId} registered with ${groups.length} groups`);

      // Handle joining a specific group
      socket.on('join-group', (groupId: string) => {
        socket.join(`group:${groupId}`);
        
        const user = connectedUsers.get(socket.id);
        if (user && !user.groups.includes(groupId)) {
          user.groups.push(groupId);
        }

        console.log(`👥 Socket ${socket.id} joined group ${groupId}`);
      });

      // Handle leaving a group
      socket.on('leave-group', (groupId: string) => {
        socket.leave(`group:${groupId}`);
        
        const user = connectedUsers.get(socket.id);
        if (user) {
          user.groups = user.groups.filter(g => g !== groupId);
        }

        console.log(`🚪 Socket ${socket.id} left group ${groupId}`);
      });

      // Handle ping for connection health
      socket.on('ping', (callback) => {
        callback({ 
          status: 'pong', 
          timestamp: new Date().toISOString(),
          socketId: socket.id,
          userId: socket.data.userId
        });
      });

    } catch (error) {
      console.error('❌ Socket connection error:', error);
      socket.emit('error', { message: 'Failed to initialize connection' });
    }

    // Handle disconnection
    socket.on('disconnect', () => {
      connectedUsers.delete(socket.id);
      console.log(`🔌 Socket disconnected: ${socket.id} - User: ${socket.data.userId}`);
    });
  });

  return io;
};

// Export io instance and helper functions
let ioInstance: SocketServer;

export const setIO = (io: SocketServer) => {
  ioInstance = io;
  console.log('✅ Socket.IO instance stored');
};

export const getIO = () => {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized');
  }
  return ioInstance;
};

// ========== EMIT HELPER FUNCTIONS ==========

// Emit to a specific user
export const emitToUser = (userId: string, event: string, data: any) => {
  try {
    const io = getIO();
    io.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log(`📢 Emitted ${event} to user ${userId}`);
  } catch (error) {
    console.error(`❌ Failed to emit ${event} to user ${userId}:`, error);
  }
};

// Emit to a group
export const emitToGroup = (groupId: string, event: string, data: any) => {
  try {
    const io = getIO();
    io.to(`group:${groupId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log(`📢 Emitted ${event} to group ${groupId}`);
  } catch (error) {
    console.error(`❌ Failed to emit ${event} to group ${groupId}:`, error);
  }
};

// Emit to multiple users
export const emitToUsers = (userIds: string[], event: string, data: any) => {
  try {
    const io = getIO();
    userIds.forEach(userId => {
      io.to(`user:${userId}`).emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
    });
    console.log(`📢 Emitted ${event} to ${userIds.length} users`);
  } catch (error) {
    console.error(`❌ Failed to emit ${event} to multiple users:`, error);
  }
};

// Emit to all members of a group except the sender
export const emitToGroupExcept = (groupId: string, senderId: string, event: string, data: any) => {
  try {
    const io = getIO();
    io.to(`group:${groupId}`).except(`user:${senderId}`).emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    console.log(`📢 Emitted ${event} to group ${groupId} except user ${senderId}`);
  } catch (error) {
    console.error(`❌ Failed to emit ${event} to group except:`, error);
  }
};

// ========== UTILITY FUNCTIONS ==========

export const getConnectedUsers = () => {
  return Array.from(connectedUsers.entries()).map(([socketId, user]) => ({
    socketId,
    userId: user.userId,
    userType: user.userType,
    groups: user.groups
  }));
};

export const isUserOnline = (userId: string): boolean => {
  return Array.from(connectedUsers.values()).some(user => user.userId === userId);
};

export const getUserSockets = (userId: string): string[] => {
  const sockets: string[] = [];
  connectedUsers.forEach((user, socketId) => {
    if (user.userId === userId) {
      sockets.push(socketId);
    }
  });
  return sockets;
};

export const getOnlineUsersInGroup = (groupId: string): string[] => {
  const onlineUsers: string[] = [];
  connectedUsers.forEach(user => {
    if (user.groups.includes(groupId)) {
      onlineUsers.push(user.userId);
    }
  });
  return onlineUsers;
};