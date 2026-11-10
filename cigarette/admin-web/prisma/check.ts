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

  const users = await prisma.user.findMany({
    select: { phoneNumber: true, role: true, displayName: true },
  });
  console.log("Users found:", users.length);
  for (const u of users) {
    console.log(`  - ${u.displayName} (${u.phoneNumber}) [${u.role}]`);
  }

  const logs = await prisma.dailyLog.count();
  console.log("Daily logs:", logs);

  const badges = await prisma.badge.count();
  console.log("Badges:", badges);

  await prisma.$disconnect();
  await pool.end();
}

check().catch(console.error);
