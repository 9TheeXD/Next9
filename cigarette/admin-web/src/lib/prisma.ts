import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://nextbreath:localdev_changeme@localhost:5432/nextbreath?schema=public";

function createPrismaClient(): PrismaClient {
  // Serverless: every instance has its own pool, so keep it small and let idle connections go.
  // Use the provider's pooled connection string (Supabase "Transaction pooler", port 6543).
  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 3),
    idleTimeoutMillis: 10000,
  });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
