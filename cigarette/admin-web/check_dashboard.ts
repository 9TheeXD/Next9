import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

async function check() {
  const pool = new pg.Pool({
    connectionString:
      "postgresql://nextbreath:localdev_changeme@localhost:5432/nextbreath?schema=public",
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const smokers = await prisma.user.findMany({
    where: { role: "SMOKER", cigarettesPerDay: { not: null } },
    select: {
      id: true,
      cigarettesPerDay: true,
      pricePerPack: true,
      cigarettesPerPack: true,
      createdAt: true,
      dailyLogs: {
        select: { cigarettesSmoked: true, logDate: true },
        orderBy: { logDate: "asc" },
      },
    },
  });

  console.log("Smokers fetched:", smokers.length);
  for (const smoker of smokers) {
    console.log(`User ${smoker.id}: baseline ${smoker.cigarettesPerDay}`);
  }

  await prisma.$disconnect();
  await pool.end();
}

check().catch(console.error);
