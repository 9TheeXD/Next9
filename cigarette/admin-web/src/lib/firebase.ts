import * as admin from 'firebase-admin';

// Initialize Firebase Admin for sending FCM Push Notifications
// The service-account key JSON (was serviceAccountKey.json beside the app) as one env var.
let serviceAccount = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (err) {
    console.warn("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
  }
}

if (serviceAccount && !admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

export const messaging = admin.apps.length ? admin.messaging() : null;

export async function sendPushNotification(tokens: string[], title: string, body: string, data?: any) {
  const expoTokens = tokens.filter(t => t.startsWith('ExponentPushToken'));
  const fcmTokens = tokens.filter(t => !t.startsWith('ExponentPushToken'));

  if (expoTokens.length > 0) {
    const messages = expoTokens.map(t => ({
      to: t,
      title,
      body,
      data,
      sound: 'default'
    }));
    try {
      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages)
      });
      console.log("Expo push response:", await resp.text());
    } catch (e) {
      console.error("Expo push error:", e);
    }
  }

  if (fcmTokens.length > 0 && messaging) {
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: fcmTokens,
        notification: { title, body },
        data
      });
      console.log(`FCM push sent. Success: ${res.successCount}, Fail: ${res.failureCount}`);
      if (res.failureCount > 0) {
        console.error("FCM push failures:", res.responses.filter(r => !r.success).map(r => r.error));
      }
    } catch (e) {
      console.error("FCM multicast error:", e);
    }
  }
}
