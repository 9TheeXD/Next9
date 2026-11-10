import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://nextbreath:localdev_changeme@localhost:5432/nextbreath?schema=public";

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function clean() {
  console.log("🧹 Cleaning test data...");
  const res = await prisma.user.deleteMany({
    where: { role: { not: "ADMIN" } },
  });
  console.log(`✅ Deleted ${res.count} test users (and all their cascaded data: logs, badges, etc.)`);
  await pool.end();
}

clean().catch((e) => {
  console.error("Cleanup failed:", e);
  process.exit(1);
});
