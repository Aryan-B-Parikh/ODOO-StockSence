import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../lib/errors.js';
import { verifyToken } from '../lib/jwt.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * JWT verification middleware. Applied to every route except the public /auth/*
 * endpoints (signup, login, otp request/verify) per 03_ARCHITECTURE.md §7 —
 * /auth/me and /auth/me PATCH are protected because they identify the caller.
 */
export function requireAuth(jwtSecret: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      next(ApiError.unauthorized('Missing Authorization header'));
      return;
    }

    const token = header.slice('Bearer '.length).trim();
    try {
      req.userId = verifyToken(token, jwtSecret);
      next();
    } catch {
      next(ApiError.unauthorized('Invalid or expired token'));
    }
  };
}
