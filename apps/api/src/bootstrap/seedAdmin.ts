import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from '../db';

const SEED_ADMIN = {
  name: 'Admin',
  email: 'admin@local.test',
  password: 'Admin@1234',
};

export const ensureSeedAdmin = async () => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: Role.ADMIN },
    select: { id: true },
  });

  if (existingAdmin) {
    return;
  }

  const existingTeam = await prisma.team.findFirst({
    where: { name: 'Marketing' },
  });

  const team =
    existingTeam ??
    (await prisma.team.create({
      data: { name: 'Marketing' },
    }));

  const passwordHash = await bcrypt.hash(SEED_ADMIN.password, 12);

  await prisma.user.create({
    data: {
      name: SEED_ADMIN.name,
      email: SEED_ADMIN.email,
      passwordHash,
      role: Role.ADMIN,
      teamId: team.id,
    },
    select: { id: true },
  });

  console.log(`[seed] Created admin ${SEED_ADMIN.email}`);
};
