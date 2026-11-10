const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.dailyLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(logs);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
