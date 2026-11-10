import { prisma } from './src/lib/prisma';
async function main() {
  const sounds = await prisma.sound.findMany({ where: { name: 'ปริศนา1' } });
  console.log(JSON.stringify(sounds, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
