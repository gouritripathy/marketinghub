import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { fail } from '../utils/apiResponse';

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  void _next;
  if (error instanceof ZodError) {
    return res.status(400).json(fail('VALIDATION_ERROR', 'Invalid request', error.flatten()));
  }
  if (error instanceof Error) {
    return res.status(500).json(fail('INTERNAL_ERROR', error.message));
  }
  return res.status(500).json(fail('INTERNAL_ERROR', 'Unknown error'));
};
