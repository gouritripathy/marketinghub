import { Router, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { registerSchema, loginSchema, updateUserSchema } from '@marketinghub/shared';
import { prisma } from '../db';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { authRateLimiter } from '../middleware/rateLimit';
import { env } from '../config/env';
import { fail, ok } from '../utils/apiResponse';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { hashPassword, verifyPassword } from '../utils/password';

const router = Router();

const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  domain: env.COOKIE_DOMAIN,
  path: '/',
});

const setAuthCookies = (res: Response, access: string, refresh: string) => {
  res.cookie('access_token', access, { ...getCookieOptions() });
  res.cookie('refresh_token', refresh, { ...getCookieOptions() });
};

const clearAuthCookies = (res: Response) => {
  res.clearCookie('access_token', getCookieOptions());
  res.clearCookie('refresh_token', getCookieOptions());
};

const issueTokens = async (userId: string, role: string, teamId: string) => {
  const accessToken = signAccessToken({ sub: userId, role, teamId });
  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({ sub: userId, role, teamId, tid: tokenId });
  const tokenHash = await bcrypt.hash(refreshToken, 12);
  const expiresAt = new Date(Date.now() + msFromTtl(env.REFRESH_TOKEN_TTL));

  await prisma.refreshToken.create({
    data: { id: tokenId, tokenHash, userId, expiresAt },
  });

  return { accessToken, refreshToken };
};

const msFromTtl = (ttl: string) => {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] ?? 0);
};

router.post(
  '/register',
  authRateLimiter,
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    if (env.DISABLE_REGISTRATION.toLowerCase() === 'true') {
      return res.status(403).json(fail('REGISTRATION_DISABLED', 'Registration is disabled'));
    }
    const payload = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(payload.password);
    const teamId = payload.teamId ?? req.user?.teamId;
    if (!teamId) {
      return res.status(400).json(fail('TEAM_REQUIRED', 'Team is required'));
    }

    const user = await prisma.user.create({
      data: {
        name: payload.name,
        email: payload.email,
        passwordHash,
        role: payload.role ?? 'MEMBER',
        teamId,
      },
      select: { id: true, name: true, email: true, role: true, teamId: true },
    });

    return res.status(201).json(ok(user));
  }),
);

router.post(
  '/login',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: payload.email } });
    if (!user) {
      return res.status(401).json(fail('INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    const valid = await verifyPassword(payload.password, user.passwordHash);
    if (!valid) {
      return res.status(401).json(fail('INVALID_CREDENTIALS', 'Invalid credentials'));
    }

    const { accessToken, refreshToken } = await issueTokens(user.id, user.role, user.teamId);
    setAuthCookies(res, accessToken, refreshToken);

    return res.json(
      ok({
        user: { id: user.id, name: user.name, email: user.email, role: user.role, teamId: user.teamId },
        accessToken,
      }),
    );
  }),
);

router.post(
  '/refresh',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const token = req.cookies?.refresh_token ?? req.body?.refreshToken;
    if (!token) {
      return res.status(401).json(fail('UNAUTHORIZED', 'Missing refresh token'));
    }

    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      return res.status(401).json(fail('UNAUTHORIZED', 'Invalid refresh token'));
    }

    const session = await prisma.refreshToken.findUnique({ where: { id: payload.tid } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json(fail('UNAUTHORIZED', 'Refresh token expired'));
    }

    const matches = await bcrypt.compare(token, session.tokenHash);
    if (!matches) {
      return res.status(401).json(fail('UNAUTHORIZED', 'Refresh token mismatch'));
    }

    await prisma.refreshToken.delete({ where: { id: session.id } });
    const { accessToken, refreshToken } = await issueTokens(payload.sub, payload.role, payload.teamId);
    setAuthCookies(res, accessToken, refreshToken);

    return res.json(ok({ accessToken }));
  }),
);

router.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const token = req.cookies?.refresh_token;
    if (token) {
      try {
        const payload = verifyRefreshToken(token);
        await prisma.refreshToken.updateMany({
          where: { id: payload.tid, userId: payload.sub },
          data: { revokedAt: new Date() },
        });
      } catch {
        // ignore invalid tokens
      }
    }
    clearAuthCookies(res);
    return res.json(ok({}));
  }),
);

router.get(
  '/users',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { teamId: req.user?.teamId },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teamId: true,
        createdAt: true,
      },
    });
    return res.json(ok(users));
  }),
);

router.patch(
  '/users/:userId',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const payload = updateUserSchema.parse(req.body);
    const { userId } = req.params;

    const existing = await prisma.user.findFirst({
      where: { id: userId, teamId: req.user?.teamId },
      select: { id: true, email: true },
    });
    if (!existing) {
      return res.status(404).json(fail('NOT_FOUND', 'User not found'));
    }

    if (payload.email && payload.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({
        where: { email: payload.email },
        select: { id: true },
      });
      if (emailTaken) {
        return res.status(409).json(fail('EMAIL_IN_USE', 'Email is already in use'));
      }
    }

    const passwordHash = payload.password ? await hashPassword(payload.password) : undefined;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: payload.name,
        email: payload.email,
        role: payload.role,
        passwordHash,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        teamId: true,
        createdAt: true,
      },
    });
    return res.json(ok(updated));
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: { id: true, name: true, email: true, role: true, teamId: true, createdAt: true },
    });
    if (!user) {
      return res.status(404).json(fail('NOT_FOUND', 'User not found'));
    }
    return res.json(ok(user));
  }),
);

export default router;
