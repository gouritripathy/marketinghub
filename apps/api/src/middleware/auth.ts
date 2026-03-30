import { Request, Response, NextFunction } from 'express';
import { fail } from '../utils/apiResponse';
import { verifyAccessToken } from '../utils/jwt';

export type AuthUser = {
  id: string;
  role: string;
  teamId: string;
};

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

const getBearerToken = (req: Request) => {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [type, token] = header.split(' ');
  if (type?.toLowerCase() !== 'bearer') return undefined;
  return token;
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = getBearerToken(req) ?? req.cookies?.access_token;
    if (!token) {
      return res.status(401).json(fail('UNAUTHORIZED', 'Missing access token'));
    }
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, teamId: payload.teamId };
    return next();
  } catch {
    return res.status(401).json(fail('UNAUTHORIZED', 'Invalid access token'));
  }
};
