import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { requireAuth } from '../middleware/auth.js';
import type { ContactsService } from './service.js';

/** 05_API_CONTRACTS.md §4b — mounted at /api/v1. */
export function createContactsRouter(service: ContactsService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get(
    '/contacts',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.list(req.query));
    }),
  );

  router.post(
    '/contacts',
    auth,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.create(req.body));
    }),
  );

  return router;
}
