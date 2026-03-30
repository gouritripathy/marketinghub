import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { ok, fail } from '../utils/apiResponse';

const router = Router();

router.get(
  '/runs/:runId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const run = await prisma.agentRun.findFirst({
      where: { id: req.params.runId, teamId: req.user!.teamId },
      include: {
        outputs: {
          include: { approvals: true },
        },
      },
    });

    if (!run) {
      return res.status(404).json(fail('NOT_FOUND', 'Run not found'));
    }

    return res.json(ok(run));
  }),
);

router.post(
  '/outputs/:outputId/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const output = await prisma.agentOutput.findFirst({
      where: { id: req.params.outputId, run: { teamId: req.user!.teamId } },
      include: { approvals: true },
    });

    if (!output) {
      return res.status(404).json(fail('NOT_FOUND', 'Output not found'));
    }

    const existingStages = new Set(output.approvals.map((approval) => approval.stage));
    const stages: Array<'BRAND' | 'LEGAL' | 'MANAGER'> = ['BRAND', 'LEGAL', 'MANAGER'];

    await prisma.$transaction([
      prisma.agentOutput.update({
        where: { id: output.id },
        data: { isFinal: true },
      }),
      ...stages
        .filter((stage) => !existingStages.has(stage))
        .map((stage) =>
          prisma.approval.create({
            data: {
              outputId: output.id,
              stage,
              status: 'PENDING',
            },
          }),
        ),
    ]);

    return res.json(ok({ outputId: output.id }));
  }),
);

router.post(
  '/approvals/:approvalId/approve',
  requireAuth,
  requireRole('REVIEWER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const approval = await prisma.approval.findFirst({
      where: { id: req.params.approvalId, output: { run: { teamId: req.user!.teamId } } },
    });

    if (!approval) {
      return res.status(404).json(fail('NOT_FOUND', 'Approval not found'));
    }

    const updated = await prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: 'APPROVED',
        reviewerId: req.user!.id,
        comments: req.body?.comments ?? null,
      },
    });

    return res.json(ok(updated));
  }),
);

router.post(
  '/approvals/:approvalId/reject',
  requireAuth,
  requireRole('REVIEWER', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const approval = await prisma.approval.findFirst({
      where: { id: req.params.approvalId, output: { run: { teamId: req.user!.teamId } } },
    });

    if (!approval) {
      return res.status(404).json(fail('NOT_FOUND', 'Approval not found'));
    }

    const updated = await prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: 'REJECTED',
        reviewerId: req.user!.id,
        comments: req.body?.comments ?? null,
      },
    });

    return res.json(ok(updated));
  }),
);

export default router;
