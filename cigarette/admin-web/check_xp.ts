import { prisma } from './src/lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    select: {
      phoneNumber: true,
      displayName: true,
      xp: true
    }
  });
  console.log(users);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
