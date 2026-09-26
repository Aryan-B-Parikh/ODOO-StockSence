import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { parseUuidParam } from '../lib/params.js';
import { requireAuth } from '../middleware/auth.js';
import type { DeliveriesService } from './service.js';

/** 05_API_CONTRACTS.md §7 — mounted at /api/v1. */
export function createDeliveriesRouter(service: DeliveriesService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get(
    '/deliveries',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.list(req.query));
    }),
  );

  router.post(
    '/deliveries',
    auth,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.create(req.body, req.userId!));
    }),
  );

  router.get(
    '/deliveries/:id',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.get(parseUuidParam(req.params.id)));
    }),
  );

  router.patch(
    '/deliveries/:id',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.update(parseUuidParam(req.params.id), req.body));
    }),
  );

  router.post(
    '/deliveries/:id/validate',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.validate(parseUuidParam(req.params.id)));
    }),
  );

  router.post(
    '/deliveries/:id/cancel',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.cancel(parseUuidParam(req.params.id)));
    }),
  );

  router.get(
    '/deliveries/:id/print',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.print(parseUuidParam(req.params.id)));
    }),
  );

  return router;
}
