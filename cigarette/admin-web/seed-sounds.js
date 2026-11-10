const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const defaultSounds = [
  { name: 'Click', url: 'local://click.wav', duration: 1, isActive: true },
  { name: 'Navigation', url: 'local://nav.wav', duration: 1, isActive: true },
  { name: 'Correct', url: 'local://correct.wav', duration: 1, isActive: true },
  { name: 'Wrong', url: 'local://wrong.wav', duration: 1, isActive: true },
  { name: 'Win', url: 'local://win.wav', duration: 2, isActive: true },
  { name: 'Lose', url: 'local://lose.wav', duration: 2, isActive: true },
  { name: 'Badge Earned', url: 'local://badge.wav', duration: 2, isActive: true },
  { name: 'XP Gain', url: 'local://xp.wav', duration: 1, isActive: true },
];

async function main() {
  console.log('Seeding default sounds...');
  for (const sound of defaultSounds) {
    const exists = await prisma.sound.findFirst({ where: { name: sound.name } });
    if (!exists) {
      await prisma.sound.create({ data: sound });
      console.log(`Created sound: ${sound.name}`);
    } else {
      console.log(`Sound already exists: ${sound.name}`);
    }
  }
  console.log('Seeding complete!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
