import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const existingTeam = await prisma.team.findFirst({
    where: { name: 'Marketing' },
  });
  const team =
    existingTeam ??
    (await prisma.team.create({
      data: { name: 'Marketing' },
    }));

  const adminPasswordHash = await bcrypt.hash('Admin@1234', 12);
  const reviewerPasswordHash = await bcrypt.hash('Reviewer@1234', 12);

  await prisma.user.upsert({
    where: { email: 'admin@local.test' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@local.test',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      teamId: team.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'reviewer@local.test' },
    update: {},
    create: {
      name: 'Reviewer',
      email: 'reviewer@local.test',
      passwordHash: reviewerPasswordHash,
      role: Role.REVIEWER,
      teamId: team.id,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
