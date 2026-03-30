import { Router } from 'express';
import { z } from 'zod';
import {
  approvalStageSchema,
  contentGoalSchema,
  contentOutputContractSchema,
} from '@marketinghub/shared';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { fail, ok } from '../utils/apiResponse';
import { ContentDraftService } from '../services/contentDraftService';
import { ApprovalService } from '../services/approvalService';

const router = Router();

const createDraftSchema = z.object({
  contentGoal: contentGoalSchema,
  topic: z.string().min(1),
  persona: z.string().min(1),
  inputSnapshot: z.record(z.any()),
});

const saveVersionSchema = z.object({
  outputJson: contentOutputContractSchema,
  humanReadable: z.string().min(1),
});

const submitSchema = z.object({
  stage: approvalStageSchema.optional(),
});

const approveSchema = z.object({
  reviewerId: z.string().uuid(),
  comments: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).optional(),
  rating: z.number().min(0).max(5).optional(),
});

const rejectSchema = z.object({
  reviewerId: z.string().uuid(),
  comments: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
  rating: z.number().min(0).max(5).optional(),
});

router.post(
  '/content/drafts',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = createDraftSchema.parse(req.body);
    const result = await ContentDraftService.createDraft({
      userId: req.user!.id,
      contentGoal: payload.contentGoal,
      topic: payload.topic,
      persona: payload.persona,
      inputSnapshot: payload.inputSnapshot,
    });

    return res.status(201).json(ok(result));
  }),
);

router.get(
  '/content/drafts/:draftId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const draft = await ContentDraftService.getDraft(req.params.draftId, req.user!.teamId);
    if (!draft) {
      return res.status(404).json(fail('NOT_FOUND', 'Draft not found'));
    }

    return res.json(ok(draft));
  }),
);

router.get(
  '/content/versions/:versionId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const version = await ContentDraftService.getVersion(req.params.versionId, req.user!.teamId);
    if (!version) {
      return res.status(404).json(fail('NOT_FOUND', 'Version not found'));
    }

    return res.json(ok(version));
  }),
);

router.post(
  '/content/versions/:versionId/save',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = saveVersionSchema.parse(req.body);
    const updated = await ContentDraftService.saveVersion(
      req.params.versionId,
      req.user!.teamId,
      payload.outputJson,
      payload.humanReadable,
    );

    if (!updated) {
      return res.status(404).json(fail('NOT_FOUND', 'Version not found'));
    }

    return res.json(ok(updated));
  }),
);

router.post(
  '/content/versions/:versionId/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = submitSchema.parse(req.body);
    const result = await ApprovalService.submit({
      versionId: req.params.versionId,
      stage: payload.stage,
      teamId: req.user!.teamId,
    });

    if (!result) {
      return res.status(404).json(fail('NOT_FOUND', 'Version not found'));
    }

    return res.json(ok({ approvalId: result.approvalId }));
  }),
);

router.post(
  '/content/approvals/:approvalId/approve',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const payload = approveSchema.parse(req.body);
    if (payload.reviewerId !== req.user!.id) {
      return res.status(403).json(fail('FORBIDDEN', 'Reviewer mismatch'));
    }

    const result = await ApprovalService.approve({
      approvalId: req.params.approvalId,
      reviewerId: payload.reviewerId,
      comments: payload.comments ?? null,
      tags: payload.tags ?? [],
      rating: payload.rating ?? null,
      teamId: req.user!.teamId,
    });

    if (!result) {
      return res.status(404).json(fail('NOT_FOUND', 'Approval not found'));
    }

    return res.json(ok({ draft: result.draft, version: result.version, nextApprovalId: result.nextApprovalId }));
  }),
);

router.post(
  '/content/approvals/:approvalId/reject',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const payload = rejectSchema.parse(req.body);
    if (payload.reviewerId !== req.user!.id) {
      return res.status(403).json(fail('FORBIDDEN', 'Reviewer mismatch'));
    }

    const result = await ApprovalService.reject({
      approvalId: req.params.approvalId,
      reviewerId: payload.reviewerId,
      comments: payload.comments,
      tags: payload.tags ?? [],
      rating: payload.rating ?? null,
      teamId: req.user!.teamId,
    });

    if (!result) {
      return res.status(404).json(fail('NOT_FOUND', 'Approval not found'));
    }

    return res.json(ok({ version: result.version }));
  }),
);

export default router;
