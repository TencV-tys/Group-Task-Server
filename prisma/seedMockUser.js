// prisma/seedMockUser.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding mock users...');

  const mockUsers = [
    { email: 'john.doe@example.com', fullName: 'John Doe', gender: 'MALE' },
    { email: 'jane.smith@example.com', fullName: 'Jane Smith', gender: 'FEMALE' },
    { email: 'mike.wilson@example.com', fullName: 'Mike Wilson', gender: 'MALE' },
    { email: 'sarah.johnson@example.com', fullName: 'Sarah Johnson', gender: 'FEMALE' },
    { email: 'alex.brown@example.com', fullName: 'Alex Brown', gender: 'OTHER' },
  ];

  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create users
  for (const userData of mockUsers) {
    const existingUser = await prisma.user.findUnique({
      where: { email: userData.email }
    });

    if (!existingUser) {
      await prisma.user.create({
        data: {
          email: userData.email,
          passwordHash: hashedPassword,
          fullName: userData.fullName,
          gender: userData.gender,
          role: 'USER',
          roleStatus: 'ACTIVE',
        }
      });
      console.log(`✅ Created user: ${userData.email}`);
    } else {
      console.log(`⏭️ User already exists: ${userData.email}`);
    }
  }

  // Check if group with invite code 016ESZ exists
  let existingGroup = await prisma.group.findUnique({
    where: { inviteCode: 'OVRQF4' }
  });

  // If group doesn't exist, create it
  if (!existingGroup) {
    if (mockUsers.length === 0 || !mockUsers[0]) {
      console.log('❌ No mock users defined or first user is undefined');
      return;
    }

    const firstUserEmail = mockUsers[0].email;
    const firstUser = await prisma.user.findFirst({
      where: { email: firstUserEmail }
    });

    if (!firstUser) {
      console.log('❌ Could not find first user to create group');
      return;
    }

    existingGroup = await prisma.group.create({
      data: {
        name: 'Development Team',
        description: 'A test group for development',
        inviteCode: 'OVRQF4',
        createdById: firstUser.id,
      }
    });
    console.log(`✅ Created group: ${existingGroup.name} with invite code: ${existingGroup.inviteCode}`);
  } else {
    console.log(`⏭️ Group with invite code 016ESZ already exists`);
  }

  // Add all users to the group
  const allUsers = await prisma.user.findMany({
    where: {
      email: { in: mockUsers.map(u => u.email) }
    }
  });

  for (let i = 0; i < allUsers.length; i++) {
    const user = allUsers[i];
    if (!user) continue;

    const existingMember = await prisma.groupMember.findFirst({
      where: {
        userId: user.id,
        groupId: existingGroup.id
      }
    });

    if (!existingMember) {
      await prisma.groupMember.create({
        data: {
          userId: user.id,
          groupId: existingGroup.id,
          groupRole: 'MEMBER',
          rotationOrder: i + 1,
          isActive: true,
        }
      });
      console.log(`✅ Added ${user.fullName} to group`);
    } else {
      console.log(`⏭️ ${user.fullName} already in group`);
    }
  }

  console.log('✅ Seeding complete!');
  console.log(`\n📋 Group Invite Code: A4RPNW`);
  console.log(`👥 Total users in group: ${allUsers.length}`);
  console.log(`\n🔑 Login credentials:`);
  mockUsers.forEach(user => {
    console.log(`   ${user.email} / password123`);
  });
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });