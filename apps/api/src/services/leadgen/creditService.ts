import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getCreditBalance(teamId: string): Promise<number> {
  const team = await prisma.team.findUniqueOrThrow({ where: { id: teamId } });
  return team.creditBalance;
}

export async function deductCredits(
  teamId: string,
  amount: number,
  description: string,
  refRunId?: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUniqueOrThrow({ where: { id: teamId } });

    if (team.creditBalance < amount) {
      throw new Error(`Insufficient credits: have ${team.creditBalance}, need ${amount}`);
    }

    const newBalance = team.creditBalance - amount;

    await tx.team.update({
      where: { id: teamId },
      data: { creditBalance: newBalance },
    });

    await tx.creditLedger.create({
      data: {
        teamId,
        txType: 'USAGE',
        amount: -amount,
        balance: newBalance,
        description,
        refRunId,
      },
    });

    return newBalance;
  });
}

export async function addCredits(
  teamId: string,
  amount: number,
  txType: 'PURCHASE' | 'BONUS' | 'REFUND',
  description: string,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.findUniqueOrThrow({ where: { id: teamId } });
    const newBalance = team.creditBalance + amount;

    await tx.team.update({
      where: { id: teamId },
      data: { creditBalance: newBalance },
    });

    await tx.creditLedger.create({
      data: {
        teamId,
        txType,
        amount,
        balance: newBalance,
        description,
      },
    });

    return newBalance;
  });
}
