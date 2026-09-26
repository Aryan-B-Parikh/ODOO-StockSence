import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { parseUuidParam } from '../lib/params.js';
import { requireAuth } from '../middleware/auth.js';
import type { TransfersService } from './service.js';

/** 05_API_CONTRACTS.md §8 — mounted at /api/v1. */
export function createTransfersRouter(service: TransfersService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get(
    '/transfers',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.list(req.query));
    }),
  );

  router.post(
    '/transfers',
    auth,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.create(req.body, req.userId!));
    }),
  );

  router.get(
    '/transfers/:id',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.get(parseUuidParam(req.params.id)));
    }),
  );

  router.patch(
    '/transfers/:id',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.update(parseUuidParam(req.params.id), req.body));
    }),
  );

  router.post(
    '/transfers/:id/confirm',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.confirm(parseUuidParam(req.params.id)));
    }),
  );

  router.post(
    '/transfers/:id/validate',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.validate(parseUuidParam(req.params.id)));
    }),
  );

  router.post(
    '/transfers/:id/cancel',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.cancel(parseUuidParam(req.params.id)));
    }),
  );

  return router;
}
