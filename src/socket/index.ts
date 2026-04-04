// socket/index.ts - COMPLETE OPTIMIZED VERSION

import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { UserJwtUtils } from '../utils/user.jwtutils';
import { AdminJwtUtils } from '../utils/admin.jwtutils';
import prisma from '../prisma';

// Define the type for group membership
interface GroupMembership {
  groupId: string;
}

// Store connected users with additional metadata
interface ConnectedUser {
  socketId: string;
  userId: string;
  userType: 'user' | 'admin';
  groups: string[];
  connectedAt: Date;
  lastActivity: Date;
}

// Connection limits
const MAX_CONNECTIONS_PER_USER = 3;
const MAX_TOTAL_CONNECTIONS = 500;
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_ATTEMPTS = 10;

// Track connection attempts per IP
const connectionAttempts = new Map<string, { count: number; resetTime: number }>();

// Store connected users
const connectedUsers = new Map<string, ConnectedUser>();

// Auth cache to reduce DB lookups
const authCache = new Map<string, { data: any; expiresAt: number }>();

// Clean up stale connections every 5 minutes
setInterval(() => {
  const now = new Date();
  const staleThreshold = 10 * 60 * 1000; // 10 minutes
  
  let cleanedCount = 0;
  for (const [socketId, user] of connectedUsers.entries()) {
    if (now.getTime() - user.lastActivity.getTime() > staleThreshold) {
      connectedUsers.delete(socketId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned ${cleanedCount} stale connections`);
  }
}, 5 * 60 * 1000);

// Clean up auth cache every hour
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  for (const [key, value] of authCache.entries()) {
    if (now > value.expiresAt) {
      authCache.delete(key);
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned ${cleanedCount} expired auth cache entries`);
  }
}, 60 * 60 * 1000);

// Clean up connection attempts map
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of connectionAttempts.entries()) {
    if (now > record.resetTime) {
      connectionAttempts.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

export const setupSocketIO = (server: HttpServer) => {
  const io = new SocketServer(server, {
    cors: {
      origin: true,
      credentials: true
    },
    // Performance optimizations
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6, // 1MB
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    perMessageDeflate: {
      threshold: 1024, // Only compress messages > 1KB
      zlibDeflateOptions: {
        chunkSize: 16 * 1024,
        level: 6
      }
    },
    connectTimeout: 45000,
    allowEIO3: true,
    serveClient: false // Don't serve client file
  });

  // Rate limiting middleware
  io.use((socket, next) => {
    const ip = socket.handshake.address;
    const now = Date.now();
    
    if (!connectionAttempts.has(ip)) {
      connectionAttempts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
      return next();
    }
    
    const record = connectionAttempts.get(ip)!;
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + RATE_LIMIT_WINDOW_MS;
      return next();
    }
    
    if (record.count >= RATE_LIMIT_MAX_ATTEMPTS) {
      console.warn(`⚠️ Rate limit exceeded for IP: ${ip}`);
      return next(new Error('Too many connection attempts. Please try again later.'));
    }
    
    record.count++;
    next();
  });

  // Authentication middleware with caching
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const tokenString = token.replace('Bearer ', '');
      
      // Check cache first
      if (authCache.has(tokenString)) {
        const cached = authCache.get(tokenString)!;
        if (cached.expiresAt > Date.now()) {
          socket.data = cached.data;
          console.log(`✅ Socket authenticated from cache: ${socket.data.userId}`);
          return next();
        }
        authCache.delete(tokenString);
      }
      
      // Try user token first
      try {
        const decoded = UserJwtUtils.verifyToken(tokenString);
        socket.data.userId = decoded.userId;
        socket.data.userType = 'user';
        socket.data.email = decoded.email;
        socket.data.role = decoded.role;
        
        // Cache for 5 minutes
        authCache.set(tokenString, {
          data: socket.data,
          expiresAt: Date.now() + 5 * 60 * 1000
        });
        
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
          
          // Cache for 5 minutes
          authCache.set(tokenString, {
            data: socket.data,
            expiresAt: Date.now() + 5 * 60 * 1000
          });
          
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
    // Check total connection limit
    if (connectedUsers.size >= MAX_TOTAL_CONNECTIONS) {
      console.warn(`⚠️ Max connections reached (${MAX_TOTAL_CONNECTIONS}). Rejecting new connection.`);
      socket.emit('error', { message: 'Server at capacity, please try later' });
      socket.disconnect();
      return;
    }
    
    // Check per-user connection limit
    const userConnections = Array.from(connectedUsers.values())
      .filter(u => u.userId === socket.data.userId).length;
    
    if (userConnections >= MAX_CONNECTIONS_PER_USER) {
      console.warn(`⚠️ User ${socket.data.userId} exceeded max connections (${MAX_CONNECTIONS_PER_USER})`);
      socket.emit('error', { message: 'Too many connections from this user' });
      socket.disconnect();
      return;
    }
    
    console.log(`🔌 New socket connection: ${socket.id} - User: ${socket.data.userId} (${socket.data.userType})`);

    try {
      // Get user's groups from database with caching
      let groups: string[] = [];
      
      if (socket.data.userType === 'user') {
        // Cache group membership in memory (could use Redis in production)
        const cacheKey = `groups_${socket.data.userId}`;
        
        const memberships = await prisma.groupMember.findMany({
          where: { 
            userId: socket.data.userId,
            isActive: true 
          },
          select: { groupId: true }
        });
        
        groups = memberships.map((membership: GroupMembership) => membership.groupId);
      }

      // Store user connection
      connectedUsers.set(socket.id, {
        socketId: socket.id,
        userId: socket.data.userId,
        userType: socket.data.userType,
        groups,
        connectedAt: new Date(),
        lastActivity: new Date()
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
        socketId: socket.id,
        connectionCount: connectedUsers.size
      });

      console.log(`✅ User ${socket.data.userId} registered with ${groups.length} groups. Total connections: ${connectedUsers.size}`);

      // Handle joining a specific group with debouncing
      let joinGroupTimeout: NodeJS.Timeout | null = null;
      socket.on('join-group', (groupId: string) => {
        if (joinGroupTimeout) clearTimeout(joinGroupTimeout);
        
        joinGroupTimeout = setTimeout(() => {
          socket.join(`group:${groupId}`);
          
          const user = connectedUsers.get(socket.id);
          if (user && !user.groups.includes(groupId)) {
            user.groups.push(groupId);
            user.lastActivity = new Date();
          }
          
          console.log(`👥 Socket ${socket.id} joined group ${groupId}`);
          joinGroupTimeout = null;
        }, 100);
      });

      // Handle leaving a group with debouncing
      let leaveGroupTimeout: NodeJS.Timeout | null = null;
      socket.on('leave-group', (groupId: string) => {
        if (leaveGroupTimeout) clearTimeout(leaveGroupTimeout);
        
        leaveGroupTimeout = setTimeout(() => {
          socket.leave(`group:${groupId}`);
          
          const user = connectedUsers.get(socket.id);
          if (user) {
            user.groups = user.groups.filter(g => g !== groupId);
            user.lastActivity = new Date();
          }
          
          console.log(`🚪 Socket ${socket.id} left group ${groupId}`);
          leaveGroupTimeout = null;
        }, 100);
      });

      // Handle ping for connection health
      socket.on('ping', (callback) => {
        const user = connectedUsers.get(socket.id);
        if (user) {
          user.lastActivity = new Date();
        }
        
        if (callback && typeof callback === 'function') {
          callback({ 
            status: 'pong', 
            timestamp: new Date().toISOString(),
            socketId: socket.id,
            userId: socket.data.userId
          });
        }
      });

    } catch (error) {
      console.error('❌ Socket connection error:', error);
      socket.emit('error', { message: 'Failed to initialize connection' });
    }

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      connectedUsers.delete(socket.id);
      console.log(`🔌 Socket disconnected: ${socket.id} - User: ${socket.data.userId} - Reason: ${reason}`);
      console.log(`📊 Remaining connections: ${connectedUsers.size}`);
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

// ========== EMIT HELPER FUNCTIONS WITH BATCHING ==========

// Batch queue for emits
const emitQueue: { userId: string; event: string; data: any }[] = [];
let isProcessingQueue = false;
let batchTimeout: NodeJS.Timeout | null = null;

const processEmitQueue = async () => {
  if (isProcessingQueue || emitQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  // Process in batches of 50
  const batchSize = 50;
  const batch = emitQueue.splice(0, batchSize);
  
  try {
    const io = getIO();
    for (const { userId, event, data } of batch) {
      io.to(`user:${userId}`).emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
    }
    console.log(`📦 Batch emitted ${batch.length} events`);
  } catch (error) {
    console.error('Error processing emit queue:', error);
  } finally {
    isProcessingQueue = false;
    if (emitQueue.length > 0) {
      setTimeout(processEmitQueue, 10);
    }
  }
};

const scheduleBatch = () => {
  if (batchTimeout) clearTimeout(batchTimeout);
  batchTimeout = setTimeout(() => {
    processEmitQueue();
    batchTimeout = null;
  }, 50);
};

export const emitToUser = (userId: string, event: string, data: any) => {
  // Queue for batch processing
  emitQueue.push({ userId, event, data });
  scheduleBatch();
};

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

export const emitToUsers = (userIds: string[], event: string, data: any) => {
  // Batch multiple users
  for (const userId of userIds) {
    emitQueue.push({ userId, event, data });
  }
  scheduleBatch();
};

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
    groups: user.groups,
    connectedAt: user.connectedAt,
    lastActivity: user.lastActivity
  }));
};

export const getConnectionStats = () => {
  const stats = {
    totalConnections: connectedUsers.size,
    userConnections: Array.from(connectedUsers.values()).filter(u => u.userType === 'user').length,
    adminConnections: Array.from(connectedUsers.values()).filter(u => u.userType === 'admin').length,
    uniqueUsers: new Set(Array.from(connectedUsers.values()).map(u => u.userId)).size,
    groupsWithConnections: new Set(Array.from(connectedUsers.values()).flatMap(u => u.groups)).size,
    maxConnections: MAX_TOTAL_CONNECTIONS,
    connectionsPerUser: MAX_CONNECTIONS_PER_USER
  };
  return stats;
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

// Health check endpoint helper
export const isSocketHealthy = (): boolean => {
  return ioInstance !== undefined;
};