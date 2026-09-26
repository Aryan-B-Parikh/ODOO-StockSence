import cors from 'cors';
import express, { type Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';
import { createAuthRouter } from './auth/routes.js';
import { AuthService } from './auth/service.js';
import type { AuthStore } from './auth/store.js';
import { createAdjustmentsRouter } from './adjustments/routes.js';
import { AdjustmentsService } from './adjustments/service.js';
import { createCatalogRouter } from './catalog/routes.js';
import { CatalogService } from './catalog/service.js';
import { createContactsRouter } from './contacts/routes.js';
import { ContactsService } from './contacts/service.js';
import { createDashboardRouter } from './dashboard/routes.js';
import { DashboardService } from './dashboard/service.js';
import { createDeliveriesRouter } from './deliveries/routes.js';
import { DeliveriesService } from './deliveries/service.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { createLocationsRouter } from './locations/routes.js';
import { LocationsService } from './locations/service.js';
import { createMoveHistoryRouter } from './move-history/routes.js';
import { MoveHistoryService } from './move-history/service.js';
import { createReceiptsRouter } from './receipts/routes.js';
import { ReceiptsService } from './receipts/service.js';
import { createStockRouter } from './stock/routes.js';
import { StockService } from './stock/service.js';
import { createTransfersRouter } from './transfers/routes.js';
import { TransfersService } from './transfers/service.js';
import { createReferenceGenerator } from './stock-engine/reference.js';
import { createStockEngine } from './stock-engine/stock-engine.js';

export interface AppDependencies {
  config: AppConfig;
  store: AuthStore;
  /**
   * When provided, the Phase 2 inventory routes (products, categories, warehouses,
   * locations, stock, dashboard) are mounted with their real Prisma-backed services.
   * Unit/API tests that only exercise auth can omit it.
   */
  prisma?: PrismaClient;
}

/**
 * Builds the Express app. Kept separate from index.ts so tests (and the integration
 * harness) can construct it with a fake or real store.
 */
export function createApp({ config, store, prisma }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()),
    }),
  );
  app.use(express.json());

  const authService = new AuthService({
    store,
    jwtSecret: config.jwtSecret,
    jwtExpiresIn: config.jwtExpiresIn,
    bcryptRounds: config.bcryptRounds,
    exposeDebugOtp: config.nodeEnv !== 'production',
  });

  // Infra health probe (used by docker-compose healthcheck; no business meaning).
  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/v1/auth', createAuthRouter(authService, config.jwtSecret));

  if (prisma) {
    const engine = createStockEngine(prisma);
    const referenceGenerator = createReferenceGenerator(prisma);

    app.use('/api/v1', createCatalogRouter(new CatalogService(prisma, engine, referenceGenerator), config.jwtSecret));
    app.use('/api/v1', createLocationsRouter(new LocationsService(prisma), config.jwtSecret));
    app.use('/api/v1', createStockRouter(new StockService(prisma, engine, referenceGenerator), config.jwtSecret));
    app.use('/api/v1', createDashboardRouter(new DashboardService(prisma), config.jwtSecret));
    app.use('/api/v1', createContactsRouter(new ContactsService(prisma), config.jwtSecret));
    app.use('/api/v1', createReceiptsRouter(new ReceiptsService(prisma, engine, referenceGenerator), config.jwtSecret));
    app.use(
      '/api/v1',
      createDeliveriesRouter(new DeliveriesService(prisma, engine, referenceGenerator), config.jwtSecret),
    );
    app.use('/api/v1', createTransfersRouter(new TransfersService(prisma, engine, referenceGenerator), config.jwtSecret));
    app.use(
      '/api/v1',
      createAdjustmentsRouter(new AdjustmentsService(prisma, engine, referenceGenerator), config.jwtSecret),
    );
    app.use('/api/v1', createMoveHistoryRouter(new MoveHistoryService(prisma), config.jwtSecret));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
