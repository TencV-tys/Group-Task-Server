// prisma.ts - UPDATED for better concurrency

import { PrismaClient } from '@prisma/client';

// Create prisma instance with connection pool management
const prisma = new PrismaClient({
  log: ['error'],
  // Connection pool settings
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// Add connection pool event listeners
prisma.$on('query' as never, (e: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`📊 Query: ${e.query} - ${e.duration}ms`);
  }
});

// Handle connection errors with retry
let isConnected = false;

async function connectWithRetry(retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect();
      console.log('✅ Database connected successfully');
      isConnected = true;
      return;
    } catch (error) {
      console.error(`❌ Database connection attempt ${i + 1} failed:`, error);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  console.error('❌ Failed to connect to database after multiple attempts');
  process.exit(1);
}

// Connect on startup
connectWithRetry();

// Health check endpoint helper
export async function checkDatabaseHealth(): Promise<boolean> {
  if (!isConnected) return false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, closing database connections...`);
  await prisma.$disconnect();
  console.log('✅ Database disconnected');
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default prisma;