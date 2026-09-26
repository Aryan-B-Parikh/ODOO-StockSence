import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { parseUuidParam } from '../lib/params.js';
import { requireAuth } from '../middleware/auth.js';
import type { StockService } from './service.js';

/** 05_API_CONTRACTS.md §3 — mounted at /api/v1. */
export function createStockRouter(service: StockService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get(
    '/stock',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.listStock(req.query));
    }),
  );

  router.patch(
    '/stock/:productId/:locationId',
    auth,
    asyncHandler(async (req, res) => {
      const productId = parseUuidParam(req.params.productId, 'productId');
      const locationId = parseUuidParam(req.params.locationId, 'locationId');
      res.status(200).json(await service.setOnHand(productId, locationId, req.body, req.userId!));
    }),
  );

  return router;
}
