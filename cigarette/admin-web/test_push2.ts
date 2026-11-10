import { prisma } from './src/lib/prisma';
import { messaging } from './src/lib/firebase';

async function test() {
  const users = await prisma.user.findMany({
    where: { fcmToken: { not: null } },
    select: { displayId: true, fcmToken: true, role: true }
  });
  console.log("Found tokens:", users.length);
  
  for (const u of users) {
    if (!u.fcmToken) continue;
    
    if (u.fcmToken.startsWith('ExponentPushToken')) {
      console.log(`${u.displayId} has Expo token: ${u.fcmToken}`);
      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: u.fcmToken, title: 'Test', body: 'Test from script' })
      });
      console.log(`Expo push to ${u.displayId}:`, await resp.text());
    } else {
      console.log(`${u.displayId} has FCM token: ${u.fcmToken.substring(0,30)}...`);
      try {
        if (!messaging) {
          console.log("Firebase not initialized");
          continue;
        }
        const res = await messaging.sendEachForMulticast({
          tokens: [u.fcmToken],
          notification: { title: 'Test FCM', body: 'Test' }
        });
        console.log(`FCM push to ${u.displayId}: Success ${res.successCount}, Fail ${res.failureCount}`);
        if (res.failureCount > 0) console.log("Error:", res.responses[0].error);
      } catch (e) {
        console.error(`FCM error for ${u.displayId}:`, e);
      }
    }
  }
}

test().finally(() => prisma.$disconnect());
