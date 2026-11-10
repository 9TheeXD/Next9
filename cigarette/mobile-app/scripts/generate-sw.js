const fs = require('fs');
const path = require('path');

const targetDirName = process.argv[2] || 'dist';
const distDir = path.join(__dirname, '..', targetDirName);
const swPath = path.join(distDir, 'sw.js');

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });
  return arrayOfFiles;
}

try {
  const files = getAllFiles(distDir);
  const urlsToCache = files
    .filter(f => !f.endsWith('sw.js')) // don't cache sw itself
    .map(f => {
      let relativePath = f.replace(distDir, '').replace(/\\/g, '/');
      return relativePath === '' ? '/' : relativePath;
    });

  // Also cache root and key navigation paths
  const routePaths = [
    '/',
    '/index.html',
    '/sos',
    '/health',
    '/knowledge',
    '/profile',
    '/login',
    '/register',
    '/history',
    '/follow',
    '/onboarding',
    '/chat',
    '/games',
    '/guidance',
  ];

  routePaths.forEach(p => {
    if (!urlsToCache.includes(p)) {
      urlsToCache.push(p);
    }
  });

  const CACHE_VERSION = Date.now().toString();

  const swContent = `
const CACHE_NAME = 'ciga-offline-v${CACHE_VERSION}';
const urlsToCache = ${JSON.stringify([...new Set(urlsToCache)])};

// Install: Precache all essential assets into cache storage (Safe error-tolerant precaching)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return Promise.all(
          urlsToCache.map(url => {
            return fetch(url, { cache: 'no-cache' }).then(response => {
              if (response && response.ok) {
                return cache.put(url, response);
              }
            }).catch(err => {
              console.warn('Precache skipped for', url, err.message);
            });
          })
        );
      })
  );
  // NOTE: Do NOT call self.skipWaiting() here per PWA update prompt architecture
});

// Activate: Clean up previous caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting stale cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Message listener for manual user update trigger
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch router
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  const url = new URL(event.request.url);

  // 0. Version Check & Service Worker Script: Always Network Only (never serve stale version.json)
  if (url.pathname === '/version.json' || url.pathname === '/sw.js') {
    event.respondWith(fetch(event.request));
    return;
  }

  // 1. API Calls: Network First -> Fallback to Cache / Structured offline response
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (!response || response.status >= 500) {
            const cache = await caches.open(CACHE_NAME);
            const cachedRes = await cache.match(event.request, { ignoreSearch: true });
            if (cachedRes) return cachedRes;

            return new Response(JSON.stringify({ success: false, data: null, message: 'Offline fallback', error: 'Offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          if (response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cachedRes = await cache.match(event.request, { ignoreSearch: true });
          if (cachedRes) return cachedRes;

          return new Response(JSON.stringify({ success: false, data: null, message: 'Offline fallback', error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // 2. Navigation requests: Network First -> Fallback to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response && response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
            return response;
          }
          throw new Error('Navigation response not OK');
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cachedNav = await cache.match(event.request, { ignoreSearch: true });
          if (cachedNav) return cachedNav;

          const cachedIndex = await cache.match('/index.html', { ignoreSearch: true }) || await cache.match('/', { ignoreSearch: true });
          if (cachedIndex) return cachedIndex;

          return new Response('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Next Breath</title><style>body{background:#f0fdfa;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:20px;color:#334155;}</style></head><body><div><h2>กำลังเชื่อมต่อใหม่...</h2><p>กรุณารอสักครู่ หรือกดปุ่มด้านล่าง</p><button onclick="location.reload()" style="background:#38bdf8;color:#fff;border:none;padding:12px 24px;border-radius:12px;font-size:16px;font-weight:bold;cursor:pointer;">ลองใหม่อีกครั้ง</button></div></body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        })
    );
    return;
  }

  // 3. Static Assets (JS / CSS / Fonts / Images): Stale-While-Revalidate / Cache-First with fallback
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(async (cachedResponse) => {
      // Background network fetch to keep cache fresh
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        // Network failed
        return null;
      });

      // If we already have a cached copy, return it immediately for instant sub-50ms boot
      if (cachedResponse) {
        return cachedResponse;
      }

      // If not in cache, wait for network fetch
      const networkResponse = await fetchPromise;
      if (networkResponse && networkResponse.ok) {
        return networkResponse;
      }

      // If network also failed:
      const isImage = event.request.url.match(/\\.(png|jpg|jpeg|gif|svg|webp|ico)$/i);
      if (isImage) {
        const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        return fetch(transparentPixel);
      }

      // For failed JS/CSS, return 503 instead of empty 200 to prevent silent code corruption
      return new Response('Asset temporarily unavailable', { status: 503, statusText: 'Offline' });
    })
  );
});
`;

  fs.writeFileSync(swPath, swContent);
  
  const versionPath = path.join(distDir, 'version.json');
  fs.writeFileSync(versionPath, JSON.stringify({ version: CACHE_VERSION }));

  console.log('Generated sw.js with ' + urlsToCache.length + ' precached files.');
} catch (err) {
  console.error("Error generating SW:", err);
}
