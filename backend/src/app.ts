import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config.js';
import { createAuthRouter } from './auth/routes.js';
import { AuthService } from './auth/service.js';
import type { AuthStore } from './auth/store.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';

export interface AppDependencies {
  config: AppConfig;
  store: AuthStore;
}

/**
 * Builds the Express app. Kept separate from index.ts so tests (and later phases'
 * integration harness) can construct it with a fake or real store.
 */
export function createApp({ config, store }: AppDependencies): Express {
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

  // Phase 2+ route groups (products, stock, warehouses, locations, dashboard,
  // receipts, deliveries, transfers, adjustments, move-history) mount here,
  // each behind requireAuth(config.jwtSecret).

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
