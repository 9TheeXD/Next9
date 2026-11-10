import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://nextbreath:localdev_changeme@localhost:5432/nextbreath?schema=public";

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log("🌱 Seeding database...\n");

  // ── Badges ──────────────────────────────────────────────
  const badges = [
    {
      name: "First Step",
      description: "Logged your very first day",
      iconName: "footprints",
      category: "MILESTONE" as const,
      criteriaDays: 1,
    },
    {
      name: "3 Days Strong",
      description: "3 consecutive smoke-free days",
      iconName: "fire",
      category: "STREAK" as const,
      criteriaDays: 3,
    },
    {
      name: "One Week Warrior",
      description: "7 consecutive smoke-free days",
      iconName: "shield",
      category: "STREAK" as const,
      criteriaDays: 7,
    },
    {
      name: "Two Week Champion",
      description: "14 consecutive smoke-free days",
      iconName: "trophy",
      category: "STREAK" as const,
      criteriaDays: 14,
    },
    {
      name: "Monthly Master",
      description: "30 consecutive smoke-free days",
      iconName: "crown",
      category: "STREAK" as const,
      criteriaDays: 30,
    },
    {
      name: "Breathing Easy",
      description: "Reached the 72-hour health milestone",
      iconName: "lungs",
      category: "HEALTH" as const,
      criteriaDays: 3,
    },
    {
      name: "Quiz Whiz",
      description: "Scored 100% on a knowledge quiz",
      iconName: "brain",
      category: "QUIZ" as const,
      criteriaValue: 100,
    },
    {
      name: "Half Way There",
      description: "Reduced daily cigarettes by 50%",
      iconName: "trending-down",
      category: "MILESTONE" as const,
      criteriaValue: 50,
    },
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { name: badge.name },
      update: {},
      create: badge,
    });
  }
  console.log(`  ✅ ${badges.length} badges seeded`);

  // ── Demo Admin User ─────────────────────────────────────
  const adminHash = await bcrypt.hash("admin12345", 12);
  const admin = await prisma.user.upsert({
    where: { phoneNumber: "admin" },
    update: {},
    create: {
      phoneNumber: "admin",
      passwordHash: adminHash,
      role: "ADMIN",
      displayName: "Student Council",
    },
  });
  console.log(`  ✅ Admin user: admin / admin12345`);

  console.log("\n🎉 Seeding complete!\n");
  await pool.end();
}

seed()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  });
