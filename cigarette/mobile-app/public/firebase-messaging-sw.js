importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCNpFrcnKCVuUUVHM6XCQO6PQOYOMtKkMQ",
  authDomain: "next9-sirin.firebaseapp.com",
  projectId: "next9-sirin",
  storageBucket: "next9-sirin.firebasestorage.app",
  messagingSenderId: "527511259371",
  appId: "1:527511259371:web:4a6ae481d519f1a42e96ae",
  measurementId: "G-LY9CHFGYZN"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'Next Breath';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: '/icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
