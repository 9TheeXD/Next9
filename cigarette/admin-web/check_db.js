const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const c = await prisma.dailyLog.count();
  console.log("Total DailyLogs:", c);
  const users = await prisma.user.findMany({ select: { id: true, role: true, cigarettesPerDay: true } });
  console.log("Users:", users);
}

check().then(() => prisma.$disconnect());
