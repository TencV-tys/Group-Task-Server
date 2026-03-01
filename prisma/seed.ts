import { PrismaClient, SystemAdminRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

async function main() {
  console.log('🌱 Seeding database...');
  console.log('====================================');

  // ============= SEED SUPER ADMIN =============
  console.log('\n👤 Creating super admin...');

  const adminEmail = process.env.SUPER_ADMIN_EMAIL;
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
  const adminName = process.env.SUPER_ADMIN_NAME;
  const adminRole = (process.env.SUPER_ADMIN_ROLE || 'SUPER_ADMIN') as SystemAdminRole;

  if (!adminEmail || !adminPassword) {
    console.error('❌ SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  try {
    // Check if admin already exists
    const existingAdmin = await prisma.systemAdmin.findUnique({
      where: { email: adminEmail }
    });

    if (existingAdmin) {
      console.log('✅ Super admin already exists:');
      console.log(`   ID: ${existingAdmin.id}`);
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.fullName}`);
      console.log(`   Role: ${existingAdmin.role}`);
    } else {
      // Hash password
      const passwordHash = await hashPassword(adminPassword);

      // Create admin
      const admin = await prisma.systemAdmin.create({
        data: {
          email: adminEmail,
          passwordHash: passwordHash,
          fullName: adminName || 'Super Admin',
          role: adminRole, // Now properly typed as SystemAdminRole
          isActive: true,
          lastLoginAt: null
        }
      });

      console.log('✅ Super admin created successfully:');
      console.log(`   ID: ${admin.id}`);
      console.log(`   Email: ${admin.email}`);
      console.log(`   Name: ${admin.fullName}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Active: ${admin.isActive}`);
    }

  } catch (error) {
    console.error('❌ Error creating super admin:', error);
  }

  // ============= ADD MORE SEED DATA HERE =============
  // You can add default categories, settings, etc.

  console.log('\n====================================');
  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });