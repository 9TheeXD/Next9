import { prisma } from './src/lib/prisma';
import { SoundCategory } from '@prisma/client';

const defaultSounds = [
  { name: 'Click', url: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/click.wav', defaultUrl: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/click.wav', isSystem: true, category: 'UI' as SoundCategory, duration: 1 },
  { name: 'Navigation', url: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/nav.wav', defaultUrl: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/nav.wav', isSystem: true, category: 'UI' as SoundCategory, duration: 1 },
  { name: 'Correct', url: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/correct.wav', defaultUrl: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/correct.wav', isSystem: true, category: 'UI' as SoundCategory, duration: 1 },
  { name: 'Wrong', url: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/wrong.wav', defaultUrl: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/wrong.wav', isSystem: true, category: 'UI' as SoundCategory, duration: 1 },
  { name: 'Win', url: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/win.wav', defaultUrl: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/win.wav', isSystem: true, category: 'UI' as SoundCategory, duration: 3 },
  { name: 'Lose', url: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/lose.wav', defaultUrl: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/lose.wav', isSystem: true, category: 'UI' as SoundCategory, duration: 3 },
  { name: 'Badge Earned', url: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/badge.wav', defaultUrl: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/badge.wav', isSystem: true, category: 'UI' as SoundCategory, duration: 4 },
  { name: 'XP Gain', url: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/xp.wav', defaultUrl: 'https://nextbreath-sounds.s3.ap-southeast-1.amazonaws.com/xp.wav', isSystem: true, category: 'UI' as SoundCategory, duration: 2 },
];

async function main() {
  console.log('Seeding default sounds...');
  for (const sound of defaultSounds) {
    const exists = await prisma.sound.findFirst({ where: { name: sound.name } });
    if (!exists) {
      await prisma.sound.create({ data: sound });
      console.log(`Created sound: ${sound.name}`);
    } else {
      await prisma.sound.update({
        where: { id: exists.id },
        data: sound
      });
      console.log(`Updated sound: ${sound.name}`);
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
