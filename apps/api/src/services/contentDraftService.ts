import { prisma } from '../db';

type CreateDraftInput = {
  userId: string;
  contentGoal: string;
  topic: string;
  persona: string;
  inputSnapshot: Record<string, unknown>;
};

export const ContentDraftService = {
  async createDraft(input: CreateDraftInput) {
    const draft = await prisma.contentDraft.create({
      data: {
        createdByUserId: input.userId,
        contentGoal: input.contentGoal,
        topic: input.topic,
        persona: input.persona,
        status: 'DRAFTING',
        versions: {
          create: {
            versionNumber: 1,
            inputSnapshotJson: input.inputSnapshot,
            briefJson: {},
            evidenceJson: {},
            outputJson: {},
            humanReadable: '',
            status: 'DRAFT',
          },
        },
      },
      include: {
        versions: {
          select: { id: true },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    return {
      draftId: draft.id,
      versionId: draft.versions[0]?.id ?? '',
    };
  },

  async getDraft(draftId: string, teamId: string) {
    return prisma.contentDraft.findFirst({
      where: { id: draftId, createdByUser: { teamId } },
      include: {
        versions: {
          select: { id: true, versionNumber: true, status: true, createdAt: true },
          orderBy: { versionNumber: 'asc' },
        },
      },
    });
  },

  async getVersion(versionId: string, teamId: string) {
    return prisma.contentDraftVersion.findFirst({
      where: { id: versionId, draft: { createdByUser: { teamId } } },
      select: {
        id: true,
        draftId: true,
        versionNumber: true,
        inputSnapshotJson: true,
        briefJson: true,
        evidenceJson: true,
        outputJson: true,
        humanReadable: true,
        status: true,
        createdAt: true,
      },
    });
  },

  async saveVersion(versionId: string, teamId: string, outputJson: unknown, humanReadable: string) {
    const version = await prisma.contentDraftVersion.findFirst({
      where: { id: versionId, draft: { createdByUser: { teamId } } },
      select: { id: true },
    });

    if (!version) return null;

    return prisma.contentDraftVersion.update({
      where: { id: versionId },
      data: { outputJson, humanReadable },
      select: {
        id: true,
        draftId: true,
        versionNumber: true,
        outputJson: true,
        humanReadable: true,
        status: true,
        createdAt: true,
      },
    });
  },
};
