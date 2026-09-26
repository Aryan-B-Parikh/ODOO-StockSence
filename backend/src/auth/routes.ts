import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { ApiError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import type { AuthService } from './service.js';

/** 05_API_CONTRACTS.md §1 — Auth (public routes + JWT-protected /me routes). */
export function createAuthRouter(service: AuthService, jwtSecret: string): Router {
  const router = Router();

  router.post(
    '/signup',
    asyncHandler(async (req, res) => {
      const result = await service.signup(req.body);
      res.status(201).json(result);
    }),
  );

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const result = await service.login(req.body);
      res.status(200).json(result);
    }),
  );

  router.post(
    '/otp/request',
    asyncHandler(async (req, res) => {
      const result = await service.requestOtp(req.body);
      res.status(200).json(result);
    }),
  );

  router.post(
    '/otp/verify-reset',
    asyncHandler(async (req, res) => {
      const result = await service.verifyOtpReset(req.body);
      res.status(200).json(result);
    }),
  );

  router.get(
    '/me',
    requireAuth(jwtSecret),
    asyncHandler(async (req, res) => {
      if (!req.userId) throw ApiError.unauthorized();
      const result = await service.getMe(req.userId);
      res.status(200).json(result);
    }),
  );

  router.patch(
    '/me',
    requireAuth(jwtSecret),
    asyncHandler(async (req, res) => {
      if (!req.userId) throw ApiError.unauthorized();
      const result = await service.updateProfile(req.userId, req.body);
      res.status(200).json(result);
    }),
  );

  return router;
}
