import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler.js';
import { parseUuidParam } from '../lib/params.js';
import { requireAuth } from '../middleware/auth.js';
import type { CatalogService } from './service.js';

/** 05_API_CONTRACTS.md §2 — mounted at /api/v1. */
export function createCatalogRouter(service: CatalogService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get(
    '/products',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.listProducts(req.query));
    }),
  );

  router.post(
    '/products',
    auth,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createProduct(req.body, req.userId!));
    }),
  );

  router.patch(
    '/products/:id',
    auth,
    asyncHandler(async (req, res) => {
      res.status(200).json(await service.updateProduct(parseUuidParam(req.params.id), req.body));
    }),
  );

  router.get(
    '/categories',
    auth,
    asyncHandler(async (_req, res) => {
      res.status(200).json(await service.listCategories());
    }),
  );

  router.post(
    '/categories',
    auth,
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createCategory(req.body));
    }),
  );

  return router;
}
