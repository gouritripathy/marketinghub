import { Router } from 'express';
import { agentRunSchema } from '@marketinghub/shared';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { ok } from '../utils/apiResponse';

const router = Router();

router.post(
  '/run',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = agentRunSchema.parse(req.body);
    const run = await prisma.agentRun.create({
      data: {
        agentKey: payload.agentKey,
        inputText: payload.inputText,
        contextJson: payload.context ?? undefined,
        status: 'QUEUED',
        userId: req.user!.id,
        teamId: req.user!.teamId,
      },
      select: { id: true },
    });

    return res.status(201).json(ok({ runId: run.id }));
  }),
);

export default router;
