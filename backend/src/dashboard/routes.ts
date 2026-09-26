import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import type { DashboardService } from './service.js';

/** 05_API_CONTRACTS.md §5 — mounted at /api/v1. */
export function createDashboardRouter(service: DashboardService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get(
    '/dashboard/kpis',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.getKpis(req.query));
    }),
  );

  return router;
}
