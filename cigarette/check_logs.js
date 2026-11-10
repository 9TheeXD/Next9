const { PrismaClient } = require('./admin-web/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ take: 1 });
  if (!users.length) return console.log("No users");
  
  const logs = await prisma.dailyLog.findMany({
    where: { userId: users[0].id },
    orderBy: { logDate: "desc" }
  });
  
  console.log("Found logs:", logs.map(l => ({
    logDate: l.logDate.toISOString(),
    smokes: l.cigarettesSmoked
  })));
  
  const now = new Date();
  const bkkTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const year = bkkTime.getUTCFullYear();
  const month = String(bkkTime.getUTCMonth() + 1).padStart(2, "0");
  const day = String(bkkTime.getUTCDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;
  
  console.log("todayStr:", todayStr);
  
  const today = logs.find(l => l.logDate.toISOString().startsWith(todayStr));
  console.log("Match:", today ? "YES" : "NO");
}

main().catch(console.error).finally(() => prisma.$disconnect());
