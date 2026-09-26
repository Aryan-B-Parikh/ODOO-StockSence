import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { parseUuidParam } from '../lib/params.js';
import { requireAuth } from '../middleware/auth.js';
import type { LocationsService } from './service.js';

/** 05_API_CONTRACTS.md §4 — mounted at /api/v1. */
export function createLocationsRouter(service: LocationsService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get(
    '/warehouses',
    auth,
    asyncHandler(async (_req, res) => {
      res.status(200).json(await service.listWarehouses());
    }),
  );

  router.post(
    '/warehouses',
    auth,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createWarehouse(req.body));
    }),
  );

  router.patch(
    '/warehouses/:id',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.updateWarehouse(parseUuidParam(req.params.id), req.body));
    }),
  );

  router.get(
    '/locations',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.listLocations(req.query));
    }),
  );

  router.post(
    '/locations',
    auth,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createLocation(req.body));
    }),
  );

  router.patch(
    '/locations/:id',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.updateLocation(parseUuidParam(req.params.id), req.body));
    }),
  );

  return router;
}
