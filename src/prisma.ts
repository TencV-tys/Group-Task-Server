// prisma.ts - ULTRA SIMPLE VERSION
import { PrismaClient } from '@prisma/client';

// Simple Prisma client without any fancy stuff
const prisma = new PrismaClient({
  log: ['error'],
});

// Test connection immediately
(async () => {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
})();

// Handle cleanup
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default prisma;