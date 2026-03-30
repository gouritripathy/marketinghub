import { Request, Response, NextFunction } from 'express';
import { fail } from '../utils/apiResponse';

export const requireRole =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json(fail('FORBIDDEN', 'Insufficient role'));
    }
    return next();
  };
