import { Prisma, PrismaClient } from '@prisma/client';

type PatternInput = {
  contentGoal: string;
  persona: string;
  topic: string;
  inputSnapshotJson: unknown;
  rating?: number | null;
  tags?: string[] | null;
  outputMeta?: Record<string, unknown> | null;
};

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const deriveInputSignature = (
  contentGoal: string,
  persona: string,
  topic: string,
  inputSnapshotJson: unknown,
) => {
  const snapshot = toRecord(inputSnapshotJson);
  const signature: Record<string, unknown> = {
    contentGoal,
    persona,
    topic,
  };

  if (snapshot.constraints !== undefined) {
    signature.constraints = snapshot.constraints;
  }

  return signature;
};

const deriveScore = (rating?: number | null, tags?: string[] | null) => {
  const base = typeof rating === 'number' ? rating : 0;
  const tagBonus = (tags?.length ?? 0) * 0.1;
  return Math.max(0, base + tagBonus);
};

type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

export const PatternService = {
  async savePromptPatternOnApprove(db: PrismaClientLike, input: PatternInput) {
    const snapshot = toRecord(input.inputSnapshotJson);
    const meta = toRecord(input.outputMeta);
    const promptSnapshotJson = {
      systemRulesUsed: Array.isArray(meta.systemRulesUsed) ? meta.systemRulesUsed : [],
      formatStyleUsed: typeof meta.formatStyle === 'string' ? meta.formatStyle : null,
      memoryIdsUsed: Array.isArray(meta.memoryIdsUsed) ? meta.memoryIdsUsed : [],
      inputSnapshotJson: snapshot,
    };

    const inputSignatureJson = deriveInputSignature(
      input.contentGoal,
      input.persona,
      input.topic,
      input.inputSnapshotJson,
    );

    return db.promptPattern.create({
      data: {
        contentGoal: input.contentGoal,
        persona: input.persona,
        promptSnapshotJson,
        inputSignatureJson,
        formatStyle: typeof meta.formatStyle === 'string' ? meta.formatStyle : null,
        score: deriveScore(input.rating, input.tags),
      },
    });
  },
  async updatePatternScore(db: PrismaClientLike, patternId: string, delta: number) {
    const existing = await db.promptPattern.findUnique({
      where: { id: patternId },
      select: { score: true },
    });
    if (!existing) return null;
    const nextScore = Math.max(0, (existing.score ?? 0) + delta);
    return db.promptPattern.update({
      where: { id: patternId },
      data: { score: nextScore },
    });
  },
};
