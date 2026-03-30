import { prisma } from '../db';
import { PatternService } from './patternService';
import { MemoryService } from './memoryService';

type SubmitInput = {
  versionId: string;
  stage?: 'BRAND' | 'LEGAL' | 'MANAGER';
  teamId: string;
};

type ApproveInput = {
  approvalId: string;
  reviewerId: string;
  comments?: string | null;
  tags?: string[] | null;
  rating?: number | null;
  teamId: string;
};

type RejectInput = {
  approvalId: string;
  reviewerId: string;
  comments: string;
  tags?: string[] | null;
  rating?: number | null;
  teamId: string;
};

const approvalStageOrder: Array<'BRAND' | 'MANAGER'> = ['BRAND', 'MANAGER'];

const getNextStage = (stage: 'BRAND' | 'LEGAL' | 'MANAGER') => {
  const index = approvalStageOrder.indexOf(stage as 'BRAND' | 'MANAGER');
  if (index === -1) return null;
  return approvalStageOrder[index + 1] ?? null;
};

export const ApprovalService = {
  async submit(input: SubmitInput) {
    const version = await prisma.contentDraftVersion.findFirst({
      where: { id: input.versionId, draft: { createdByUser: { teamId: input.teamId } } },
      select: { id: true, draftId: true },
    });

    if (!version) return null;

    const existingApproval = await prisma.contentApprovalFeedback.findFirst({
      where: { versionId: input.versionId, decision: 'PENDING' },
      select: { id: true },
    });

    if (existingApproval) {
      return { version, approvalId: existingApproval.id };
    }

    const initialStage = approvalStageOrder[0];

    const [updatedVersion, approval] = await prisma.$transaction([
      prisma.contentDraftVersion.update({
        where: { id: input.versionId },
        data: { status: 'SUBMITTED' },
        select: { id: true },
      }),
      prisma.contentDraft.update({
        where: { id: version.draftId },
        data: { status: 'IN_REVIEW' },
        select: { id: true },
      }),
      prisma.contentApprovalFeedback.create({
        data: {
          versionId: input.versionId,
          stage: initialStage,
          decision: 'PENDING',
        },
        select: { id: true },
      }),
    ]);

    return { version: updatedVersion, approvalId: approval.id };
  },

  async approve(input: ApproveInput) {
    return prisma.$transaction(async (tx) => {
      const approval = await tx.contentApprovalFeedback.findFirst({
        where: {
          id: input.approvalId,
          decision: 'PENDING',
          version: { draft: { createdByUser: { teamId: input.teamId } } },
        },
        include: { version: { include: { draft: true } } },
      });

      if (!approval) return null;

      if (!approvalStageOrder.includes(approval.stage as 'BRAND' | 'MANAGER')) {
        return null;
      }

      const updatedApproval = await tx.contentApprovalFeedback.update({
        where: { id: approval.id },
        data: {
          decision: 'APPROVED',
          reviewerId: input.reviewerId,
          comments: input.comments ?? null,
          tags: input.tags ?? [],
          rating: input.rating ?? null,
        },
      });

      const nextStage = getNextStage(approval.stage);
      let updatedVersion = approval.version;
      let updatedDraft = approval.version.draft;
      let nextApprovalId: string | null = null;

      if (nextStage) {
        await tx.contentDraftVersion.update({
          where: { id: approval.versionId },
          data: { status: 'SUBMITTED' },
        });

        await tx.contentDraft.update({
          where: { id: approval.version.draftId },
          data: { status: 'IN_REVIEW' },
        });

        const nextApproval = await tx.contentApprovalFeedback.create({
          data: {
            versionId: approval.versionId,
            stage: nextStage,
            decision: 'PENDING',
          },
          select: { id: true },
        });
        nextApprovalId = nextApproval.id;
      } else {
        updatedVersion = await tx.contentDraftVersion.update({
          where: { id: approval.versionId },
          data: { status: 'FINAL' },
        });

        const latest = await tx.contentDraftVersion.findFirst({
          where: { draftId: approval.version.draftId },
          orderBy: { versionNumber: 'desc' },
          select: { id: true },
        });

        updatedDraft =
          latest?.id === approval.versionId
            ? await tx.contentDraft.update({
                where: { id: approval.version.draftId },
                data: { status: 'FINAL' },
              })
            : approval.version.draft;

        const outputMeta = (approval.version.outputJson as Record<string, unknown>)?.content_meta;
        const meta = outputMeta && typeof outputMeta === 'object' ? outputMeta : {};
        const memoryIds = Array.isArray((meta as Record<string, unknown>).memoryIdsUsed)
          ? ((meta as Record<string, unknown>).memoryIdsUsed as string[])
          : [];
        const patternUsed =
          typeof (meta as Record<string, unknown>).patternUsed === 'string'
            ? ((meta as Record<string, unknown>).patternUsed as string)
            : null;

        await PatternService.savePromptPatternOnApprove(tx, {
          contentGoal: approval.version.draft.contentGoal,
          persona: approval.version.draft.persona,
          topic: approval.version.draft.topic,
          inputSnapshotJson: approval.version.inputSnapshotJson,
          rating: input.rating,
          tags: input.tags,
          outputMeta: meta,
        });

        if (patternUsed) {
          await PatternService.updatePatternScore(tx, patternUsed, 0.2);
        }

        if (memoryIds.length > 0) {
          await MemoryService.updateMemoryUsage(tx, memoryIds, 0.1);
        }
      }

      return {
        approval: updatedApproval,
        version: updatedVersion,
        draft: updatedDraft,
        nextApprovalId,
      };
    });
  },

  async reject(input: RejectInput) {
    return prisma.$transaction(async (tx) => {
      const approval = await tx.contentApprovalFeedback.findFirst({
        where: {
          id: input.approvalId,
          decision: 'PENDING',
          version: { draft: { createdByUser: { teamId: input.teamId } } },
        },
        include: { version: { include: { draft: true } } },
      });

      if (!approval) return null;

      const updatedApproval = await tx.contentApprovalFeedback.update({
        where: { id: approval.id },
        data: {
          decision: 'NEEDS_CHANGES',
          reviewerId: input.reviewerId,
          comments: input.comments,
          tags: input.tags ?? [],
          rating: input.rating ?? null,
        },
      });

      const updatedVersion = await tx.contentDraftVersion.update({
        where: { id: approval.versionId },
        data: { status: 'REJECTED' },
      });

      await tx.contentDraft.update({
        where: { id: approval.version.draftId },
        data: { status: 'DRAFTING' },
      });

      await MemoryService.storeAvoidMemoryOnReject(tx, {
        teamId: input.teamId,
        tags: input.tags,
        comments: input.comments,
      });

      const outputMeta = (approval.version.outputJson as Record<string, unknown>)?.content_meta;
      const meta = outputMeta && typeof outputMeta === 'object' ? outputMeta : {};
      const memoryIds = Array.isArray((meta as Record<string, unknown>).memoryIdsUsed)
        ? ((meta as Record<string, unknown>).memoryIdsUsed as string[])
        : [];
      const patternUsed =
        typeof (meta as Record<string, unknown>).patternUsed === 'string'
          ? ((meta as Record<string, unknown>).patternUsed as string)
          : null;

      if (patternUsed) {
        await PatternService.updatePatternScore(tx, patternUsed, -0.2);
      }

      if (memoryIds.length > 0) {
        await MemoryService.updateMemoryUsage(tx, memoryIds, -0.1);
      }

      return {
        approval: updatedApproval,
        version: updatedVersion,
      };
    });
  },
};
