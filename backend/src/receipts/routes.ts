import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { parseUuidParam } from '../lib/params.js';
import { requireAuth } from '../middleware/auth.js';
import type { ReceiptsService } from './service.js';

/** 05_API_CONTRACTS.md §6 — mounted at /api/v1. */
export function createReceiptsRouter(service: ReceiptsService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get(
    '/receipts',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.list(req.query));
    }),
  );

  router.post(
    '/receipts',
    auth,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.create(req.body, req.userId!));
    }),
  );

  router.get(
    '/receipts/:id',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.get(parseUuidParam(req.params.id)));
    }),
  );

  router.patch(
    '/receipts/:id',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.update(parseUuidParam(req.params.id), req.body));
    }),
  );

  router.post(
    '/receipts/:id/confirm',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.confirm(parseUuidParam(req.params.id)));
    }),
  );

  router.post(
    '/receipts/:id/validate',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.validate(parseUuidParam(req.params.id)));
    }),
  );

  router.post(
    '/receipts/:id/cancel',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.cancel(parseUuidParam(req.params.id)));
    }),
  );

  router.get(
    '/receipts/:id/print',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.print(parseUuidParam(req.params.id)));
    }),
  );

  return router;
}
