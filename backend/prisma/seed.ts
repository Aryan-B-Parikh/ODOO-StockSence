/**
 * Seed script — skeleton introduced in Phase 1 (Person 1 task per 08_PHASE_PLAN.md).
 * Phase 2 extends this with warehouses/locations/categories/products/sample stock
 * (see 11_TESTING_STRATEGY.md "Test Data": one canonical seed dataset).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.count();
    console.log(`[seed] skeleton run — users in database: ${users}.`);
    console.log('[seed] Phase 2 will add warehouses, locations, categories, products and stock.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[seed] failed', error);
  process.exitCode = 1;
});
