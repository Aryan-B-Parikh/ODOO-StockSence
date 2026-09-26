import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import type { MoveHistoryService } from './service.js';

/** 05_API_CONTRACTS.md §10 — mounted at /api/v1. */
export function createMoveHistoryRouter(service: MoveHistoryService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get(
    '/move-history',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.list(req.query));
    }),
  );

  return router;
}
