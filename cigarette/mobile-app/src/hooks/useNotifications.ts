import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { api } from '@/lib/api';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import firebaseConfig from '@/lib/firebaseConfig';

// Initialize Firebase if not already initialized
let messaging: any = null;
try {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
  }
} catch (error) {
  console.log("Firebase initialization error:", error);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useNotifications(isAuthenticated: boolean) {
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState<Notifications.Notification | undefined>(
    undefined
  );
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        // Send token to backend
        api.updateFcmToken(token).catch(err => console.warn('Failed to update FCM token', err));
      }
    });

    if (Platform.OS === 'web' && messaging) {
      onMessage(messaging, (payload) => {
        console.log("Foreground push received:", payload);
        const title = payload.notification?.title || 'แจ้งเตือน';
        const body = payload.notification?.body || '';
        if (Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icon.png' });
        }
      });
    } else {
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        setNotification(notification);
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        console.log(response);
      });
    }

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [isAuthenticated]);

  return {
    expoPushToken,
    notification,
  };
}

async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#38bdf8',
    });
  }

  if (Device.isDevice || Platform.OS === 'web') {
    if (Platform.OS === 'web') {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted' && messaging) {
          token = await getToken(messaging, {
            vapidKey: "BCqjB12k__WH9eJW5Si3XxmOBbhStZqhcGx4IHFDpFMbbbrC25ydXLP07lNHIqUZ84Q4lvzmEZ7bPrFS9iTWoUo"
          });
        } else {
          console.warn('Web push permission not granted or messaging not ready');
        }
      } catch (e) {
        console.warn('Failed to get FCM token on web', e);
      }
      return token;
    }

    const { status: existingStatus } = (await Notifications.getPermissionsAsync()) as any;
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = (await Notifications.requestPermissionsAsync()) as any;
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('Failed to get push token for push notification!');
      return;
    }
    
    try {
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: 'sdh-council-nextbreath' // dummy projectId for local dev
      })).data;
    } catch (e) {
      console.warn('Failed to get token', e);
    }
  }

  return token;
}
