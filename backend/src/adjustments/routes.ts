import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { parseUuidParam } from '../lib/params.js';
import { requireAuth } from '../middleware/auth.js';
import type { AdjustmentsService } from './service.js';

/** 05_API_CONTRACTS.md §9 — mounted at /api/v1. */
export function createAdjustmentsRouter(service: AdjustmentsService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get(
    '/adjustments',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.list(req.query));
    }),
  );

  router.post(
    '/adjustments',
    auth,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.create(req.body, req.userId!));
    }),
  );

  router.get(
    '/adjustments/:id',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.get(parseUuidParam(req.params.id)));
    }),
  );

  return router;
}
