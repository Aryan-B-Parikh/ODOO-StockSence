import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

/** Single PrismaClient per process (avoids exhausting the connection pool in dev watch mode). */
export function getPrisma(databaseUrl?: string): PrismaClient {
  if (!client) {
    client = new PrismaClient(
      databaseUrl
        ? {
            datasources: { db: { url: databaseUrl } },
          }
        : undefined,
    );
  }
  return client;
}
