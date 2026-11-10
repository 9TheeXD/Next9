import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    where: { fcmToken: { not: null } },
    select: { displayId: true, fcmToken: true }
  });
  console.log(users);
}
main().catch(console.error).finally(() => prisma.$disconnect());
