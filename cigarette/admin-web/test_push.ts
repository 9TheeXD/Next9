import { PrismaClient } from '@prisma/client';
import * as admin from 'firebase-admin';

let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
} catch(e) {}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const prisma = new PrismaClient();

async function test() {
  const users = await prisma.user.findMany({
    where: { fcmToken: { not: null } },
    select: { displayId: true, fcmToken: true, role: true }
  });
  console.log("Found tokens:", users.length);
  
  for (const u of users) {
    if (!u.fcmToken) continue;
    
    // check if it looks like Expo token
    if (u.fcmToken.startsWith('ExponentPushToken')) {
      console.log(`${u.displayId} has Expo token: ${u.fcmToken}`);
      // Expo push
      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: u.fcmToken, title: 'Test', body: 'Test from script' })
      });
      console.log(`Expo push to ${u.displayId}:`, await resp.text());
    } else {
      console.log(`${u.displayId} has FCM token: ${u.fcmToken.substring(0,20)}...`);
      try {
        const res = await admin.messaging().sendEachForMulticast({
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
