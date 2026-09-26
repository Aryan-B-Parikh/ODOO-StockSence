import 'dotenv/config';
import { createApp } from './app.js';
import { PrismaAuthStore } from './auth/store.prisma.js';
import { loadConfig } from './config.js';
import { getPrisma } from './lib/prisma.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = getPrisma(config.databaseUrl);
  const app = createApp({ config, store: new PrismaAuthStore(prisma) });

  app.listen(config.port, () => {
    console.log(`[api] StockSense API listening on http://localhost:${config.port}/api/v1`);
  });
}

main().catch((error) => {
  console.error('[api] failed to start', error);
  process.exitCode = 1;
});
