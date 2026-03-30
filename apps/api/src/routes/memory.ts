import { Router } from 'express';
import { memoryCreateSchema } from '@marketinghub/shared';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { ok } from '../utils/apiResponse';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { scope, type, tags, search } = req.query;
    const tagList =
      typeof tags === 'string' ? tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [];

    const where: Record<string, unknown> = {};

    if (scope) {
      where.scope = scope;
      if (scope === 'USER') {
        where.ownerUserId = req.user!.id;
      }
      if (scope === 'TEAM') {
        where.ownerTeamId = req.user!.teamId;
      }
    }

    if (type) where.type = type;
    if (tagList.length > 0) where.tags = { hasEvery: tagList };
    if (typeof search === 'string' && search.trim().length > 0) {
      where.OR = [
        { key: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const items = await prisma.memoryItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return res.json(ok(items));
  }),
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = memoryCreateSchema.parse(req.body);
    const ownerUserId =
      payload.scope === 'USER' ? payload.ownerUserId ?? req.user!.id : payload.ownerUserId;
    const ownerTeamId =
      payload.scope === 'TEAM' ? payload.ownerTeamId ?? req.user!.teamId : payload.ownerTeamId;

    const item = await prisma.memoryItem.create({
      data: {
        scope: payload.scope,
        type: payload.type,
        key: payload.key,
        content: payload.content,
        tags: payload.tags ?? [],
        confidence: payload.confidence ?? 0,
        ownerUserId,
        ownerTeamId,
      },
    });

    return res.status(201).json(ok(item));
  }),
);

export default router;
