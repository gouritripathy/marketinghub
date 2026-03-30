import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { leadCampaignCreateSchema } from '@marketinghub/shared';
import { requireAuth } from '../middleware/auth';
import { ok, fail } from '../utils/apiResponse';
import { getLeadPipelineQueue } from '../queue/leadPipelineQueue';
import { getCreditBalance, addCredits } from '../services/leadgen/creditService';

const prisma = new PrismaClient();
const router = Router();

// ── Campaign CRUD ──

router.post('/campaigns', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = leadCampaignCreateSchema.parse(req.body);
    const user = req.user!;

    const campaign = await prisma.leadCampaign.create({
      data: {
        teamId: user.teamId,
        createdByUserId: user.id,
        name: parsed.name,
        inputUrl: parsed.inputUrl,
        inputText: parsed.inputText,
        configJson: parsed.config ?? undefined,
      },
    });

    return res.status(201).json(ok(campaign));
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return res.status(400).json(fail('VALIDATION_ERROR', err.message));
    }
    return res.status(500).json(fail('INTERNAL_ERROR', (err as Error).message));
  }
});

router.get('/campaigns', requireAuth, async (req: Request, res: Response) => {
  try {
    const campaigns = await prisma.leadCampaign.findMany({
      where: { teamId: req.user!.teamId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { runs: true } },
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            currentLayer: true,
            totalCost: true,
            creditsUsed: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });

    return res.json(ok(campaigns));
  } catch (err) {
    return res.status(500).json(fail('INTERNAL_ERROR', (err as Error).message));
  }
});

router.get('/campaigns/:campaignId', requireAuth, async (req: Request, res: Response) => {
  try {
    const campaign = await prisma.leadCampaign.findFirst({
      where: { id: req.params.campaignId, teamId: req.user!.teamId },
      include: {
        runs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!campaign) {
      return res.status(404).json(fail('NOT_FOUND', 'Campaign not found'));
    }

    return res.json(ok(campaign));
  } catch (err) {
    return res.status(500).json(fail('INTERNAL_ERROR', (err as Error).message));
  }
});

// ── Pipeline Execution ──

router.post('/campaigns/:campaignId/run', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user!;

    const campaign = await prisma.leadCampaign.findFirst({
      where: { id: req.params.campaignId, teamId: user.teamId },
    });

    if (!campaign) {
      return res.status(404).json(fail('NOT_FOUND', 'Campaign not found'));
    }

    const credits = await getCreditBalance(user.teamId);
    if (credits <= 0) {
      return res.status(402).json(fail('INSUFFICIENT_CREDITS', 'No credits available'));
    }

    const run = await prisma.leadPipelineRun.create({
      data: {
        campaignId: campaign.id,
        status: 'QUEUED',
      },
    });

    await prisma.leadCampaign.update({
      where: { id: campaign.id },
      data: { status: 'ACTIVE' },
    });

    const queue = getLeadPipelineQueue();
    await queue.add('run-pipeline', {
      runId: run.id,
      campaignId: campaign.id,
      teamId: user.teamId,
      userId: user.id,
    });

    return res.status(202).json(ok({ runId: run.id, status: 'QUEUED' }));
  } catch (err) {
    return res.status(500).json(fail('INTERNAL_ERROR', (err as Error).message));
  }
});

// ── Pipeline Run Status (SSE) ──

router.get('/runs/:runId/stream', requireAuth, async (req: Request, res: Response) => {
  const run = await prisma.leadPipelineRun.findFirst({
    where: { id: req.params.runId },
    include: { campaign: { select: { teamId: true } } },
  });

  if (!run || run.campaign.teamId !== req.user!.teamId) {
    return res.status(404).json(fail('NOT_FOUND', 'Run not found'));
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const sendUpdate = async () => {
    const current = await prisma.leadPipelineRun.findUnique({
      where: { id: run.id },
      include: {
        layerLogs: { orderBy: { createdAt: 'asc' } },
        _count: { select: { results: true, candidates: true } },
      },
    });

    if (!current) return;

    const data = {
      status: current.status,
      currentLayer: current.currentLayer,
      layers: current.layerLogs.map((l) => ({
        layer: l.layer,
        status: l.status,
        durationMs: l.durationMs,
        confidence: (l.telemetryJson as any)?.layer_confidence,
      })),
      candidateCount: current._count.candidates,
      resultCount: current._count.results,
      totalCost: current.totalCost,
    };

    res.write(`data: ${JSON.stringify(data)}\n\n`);

    return current.status === 'COMPLETED' || current.status === 'FAILED' || current.status === 'CANCELLED';
  };

  const poll = async () => {
    const done = await sendUpdate();
    if (done) {
      res.write('event: done\ndata: {}\n\n');
      res.end();
      return;
    }
    setTimeout(() => void poll(), 2000);
  };

  void poll();

  req.on('close', () => res.end());
});

// ── Run Details ──

router.get('/runs/:runId', requireAuth, async (req: Request, res: Response) => {
  try {
    const run = await prisma.leadPipelineRun.findFirst({
      where: { id: req.params.runId },
      include: {
        campaign: { select: { teamId: true, name: true } },
        layerLogs: { orderBy: { createdAt: 'asc' } },
        _count: { select: { results: true, candidates: true } },
      },
    });

    if (!run || run.campaign.teamId !== req.user!.teamId) {
      return res.status(404).json(fail('NOT_FOUND', 'Run not found'));
    }

    return res.json(ok(run));
  } catch (err) {
    return res.status(500).json(fail('INTERNAL_ERROR', (err as Error).message));
  }
});

// ── Results ──

router.get('/runs/:runId/results', requireAuth, async (req: Request, res: Response) => {
  try {
    const run = await prisma.leadPipelineRun.findFirst({
      where: { id: req.params.runId },
      include: { campaign: { select: { teamId: true } } },
    });

    if (!run || run.campaign.teamId !== req.user!.teamId) {
      return res.status(404).json(fail('NOT_FOUND', 'Run not found'));
    }

    const results = await prisma.leadResult.findMany({
      where: { runId: run.id },
      orderBy: { leadScore: 'desc' },
    });

    return res.json(ok(results));
  } catch (err) {
    return res.status(500).json(fail('INTERNAL_ERROR', (err as Error).message));
  }
});

// ── Candidates (audit trail) ──

router.get('/runs/:runId/candidates', requireAuth, async (req: Request, res: Response) => {
  try {
    const run = await prisma.leadPipelineRun.findFirst({
      where: { id: req.params.runId },
      include: { campaign: { select: { teamId: true } } },
    });

    if (!run || run.campaign.teamId !== req.user!.teamId) {
      return res.status(404).json(fail('NOT_FOUND', 'Run not found'));
    }

    const candidates = await prisma.leadCandidate.findMany({
      where: { runId: run.id },
      orderBy: { createdAt: 'asc' },
      include: { result: true },
    });

    return res.json(ok(candidates));
  } catch (err) {
    return res.status(500).json(fail('INTERNAL_ERROR', (err as Error).message));
  }
});

// ── CSV Export ──

router.get('/runs/:runId/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const run = await prisma.leadPipelineRun.findFirst({
      where: { id: req.params.runId },
      include: { campaign: { select: { teamId: true, name: true } } },
    });

    if (!run || run.campaign.teamId !== req.user!.teamId) {
      return res.status(404).json(fail('NOT_FOUND', 'Run not found'));
    }

    const results = await prisma.leadResult.findMany({
      where: { runId: run.id },
      orderBy: { leadScore: 'desc' },
    });

    const csvField = (val: string) => `"${val.replace(/"/g, '""')}"`;

    const headers = ['First_Name', 'Last_Name', 'Company', 'Title', 'Email', 'Lead_Score', 'Sales_Rationale', 'Evidence_URL'];
    const rows = results.map((r) => [
      csvField(r.firstName),
      csvField(r.lastName),
      csvField(r.company),
      csvField(r.title),
      csvField(r.email),
      csvField(String(r.leadScore)),
      csvField(r.salesRationale),
      csvField(r.evidenceUrl),
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    const filename = `leads-${run.campaign.name.replace(/[^a-z0-9]/gi, '-')}-${run.id.slice(0, 8)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json(fail('INTERNAL_ERROR', (err as Error).message));
  }
});

// ── Credit Balance ──

router.get('/credits', requireAuth, async (req: Request, res: Response) => {
  try {
    const balance = await getCreditBalance(req.user!.teamId);

    const history = await prisma.creditLedger.findMany({
      where: { teamId: req.user!.teamId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.json(ok({ balance, history }));
  } catch (err) {
    return res.status(500).json(fail('INTERNAL_ERROR', (err as Error).message));
  }
});

// ── Admin: Seed Credits ──

router.post('/credits/seed', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ADMIN') {
      return res.status(403).json(fail('FORBIDDEN', 'Admin only'));
    }

    const amount = Number(req.body.amount) || 100;
    const newBalance = await addCredits(
      req.user!.teamId,
      amount,
      'BONUS',
      `Admin seed: ${amount} credits`,
    );

    return res.json(ok({ balance: newBalance, credited: amount }));
  } catch (err) {
    return res.status(500).json(fail('INTERNAL_ERROR', (err as Error).message));
  }
});

export default router;
