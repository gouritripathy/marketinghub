import { Prisma, PrismaClient } from '@prisma/client';

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

type RejectMemoryInput = {
  teamId: string;
  tags?: string[] | null;
  comments?: string | null;
};

const triggerTags = new Set(['claim', 'tone', 'forbidden']);

export const MemoryService = {
  async storeAvoidMemoryOnReject(db: PrismaClientLike, input: RejectMemoryInput) {
    const tags = input.tags ?? [];
    const matched = tags
      .map((tag) => tag.toLowerCase())
      .filter((tag) => triggerTags.has(tag));

    if (matched.length === 0) return [];

    const created: string[] = [];

    for (const tag of matched) {
      const item = await db.memoryItem.create({
        data: {
          scope: 'TEAM',
          type: 'AVOID',
          key: `avoid_${tag}`,
          content: input.comments?.trim() ? input.comments.trim() : `Avoid issues related to ${tag}.`,
          tags: [tag],
          confidence: 0.5,
          ownerTeamId: input.teamId,
        },
        select: { id: true },
      });
      created.push(item.id);
    }

    return created;
  },
  async updateMemoryUsage(db: PrismaClientLike, memoryIds: string[], delta: number) {
    const now = new Date();
    for (const id of memoryIds) {
      const existing = await db.memoryItem.findUnique({
        where: { id },
        select: { confidence: true },
      });
      if (!existing) continue;
      const nextConfidence = Math.min(1, Math.max(0, (existing.confidence ?? 0) + delta));
      await db.memoryItem.update({
        where: { id },
        data: { confidence: nextConfidence, lastUsedAt: now },
      });
    }
  },
};
