const APP_VERSION = 'v11';
const CACHE_NAME = 'ysm-attendance-v11';
const STATIC_CACHE = 'ysm-static-v11';
const API_CACHE = 'ysm-api-v11';
const OFFLINE_QUEUE_STORE = 'offline-attendance-queue';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/attendance',
  '/dashboard',
  '/login',
  '/college-logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-192x192.png',
  '/icons/icon-maskable-512x512.png',
  '/manifest.json',
];

// API routes that should be cached (network-first)
const CACHEABLE_API_ROUTES = [
  '/api/student-subjects',
  '/api/teacher-subjects',
  '/api/teachers',
  '/api/holidays',
  '/api/subjects',
  '/api/departments',
  '/api/attendance',
];

// API routes that should NEVER be cached
const NEVER_CACHE_ROUTES = [
  '/api/auth',
];

// ========================
// INSTALL - Pre-cache app shell
// ========================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('SW: Pre-cache failed for some URLs:', err);
      });
    })
  );
  self.skipWaiting();
});

// ========================
// ACTIVATE - Clean old caches
// ========================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== API_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Always notify clients of current version
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_VERSION',
            data: { version: APP_VERSION },
          });
        });
      });
    })
  );
  self.clients.claim();
});

// ========================
// FETCH - Smart caching strategies
// ========================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests except attendance POST (handled separately)
  if (event.request.method === 'POST') {
    // Handle offline attendance POST
    if (url.pathname === '/api/attendance') {
      event.respondWith(handleAttendancePost(event.request));
    }
    return;
  }

  // Only handle GET requests from here
  if (event.request.method !== 'GET') return;

  // Never cache auth routes
  if (NEVER_CACHE_ROUTES.some((route) => url.pathname.startsWith(route))) {
    return;
  }

  // API routes - Network first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    if (CACHEABLE_API_ROUTES.some((route) => url.pathname.startsWith(route))) {
      event.respondWith(networkFirstWithCache(event.request, API_CACHE));
    }
    return;
  }

  // Static assets & pages - Cache first for assets, network first for pages
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstWithNetwork(event.request, STATIC_CACHE));
  } else {
    // HTML pages - network first
    event.respondWith(networkFirstWithCache(event.request, STATIC_CACHE));
  }
});

// ========================
// Caching Strategies
// ========================

// Network first, cache fallback (for API data & pages)
async function networkFirstWithCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Network failed, try cache
    let cachedResponse = await caches.match(request);

    // --- OFFLINE MERGE LOGIC FOR ATTENDANCE ---
    if (cachedResponse && request.url.includes('/api/attendance') && request.method === 'GET') {
      try {
        const urlObj = new URL(request.url);
        if (urlObj.pathname === '/api/attendance') {
          const subjectId = urlObj.searchParams.get('subjectId');
          const date = urlObj.searchParams.get('date');

          if (subjectId && date) {
            const offlineItems = await getAllFromQueue();
            const pendingUpdates = offlineItems.filter(item =>
              item.body &&
              item.body.subjectId === subjectId &&
              item.body.date === date
            );

            if (pendingUpdates.length > 0) {
              const cachedData = await cachedResponse.clone().json();

              if (cachedData.records && Array.isArray(cachedData.records)) {
                // Map the latest offline status for each student
                const latestStatusMap = {};
                pendingUpdates.forEach(update => {
                  if (update.body.records) {
                    update.body.records.forEach(r => {
                      latestStatusMap[r.studentId] = r.status;
                    });
                  }
                });

                // Overwrite the loaded cache rendering visually with our unsynced local changes
                cachedData.records = cachedData.records.map(record => ({
                  ...record,
                  status: latestStatusMap[record.student_id] || record.status
                }));

                return new Response(JSON.stringify(cachedData), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            }
          }
        }
      } catch (mergeErr) {
        console.warn('SW: Merge error', mergeErr);
      }
    }

    if (cachedResponse) {
      return cachedResponse;
    }
    // If it's a page navigation, return the cached root page (handles auth redirect)
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/');
      if (fallback) return fallback;
    }
    return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Cache first, network fallback (for static assets)
async function cacheFirstWithNetwork(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    return new Response('Offline', { status: 503 });
  }
}

// ========================
// Offline Attendance POST Handler
// ========================
async function handleAttendancePost(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch (err) {
    // Network failed - queue the request for later
    const body = await request.json();
    const authHeader = request.headers.get('Authorization');

    await saveToOfflineQueue({
      url: request.url,
      body,
      authHeader,
      timestamp: Date.now(),
    });

    // Notify all clients about offline save
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'ATTENDANCE_QUEUED',
        data: { subjectId: body.subjectId, date: body.date, count: body.records?.length || 0 },
      });
    });

    return new Response(
      JSON.stringify({
        message: 'Saved offline - will sync when online',
        offline: true,
        savedCount: body.records?.length || 0,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ========================
// IndexedDB for Offline Queue
// ========================
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ysm-attendance-offline', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
        db.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToOfflineQueue(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
    tx.objectStore(OFFLINE_QUEUE_STORE).add(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllFromQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readonly');
    const request = tx.objectStore(OFFLINE_QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
    tx.objectStore(OFFLINE_QUEUE_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ========================
// Sync - Replay offline queue
// ========================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_OFFLINE_QUEUE') {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  const items = await getAllFromQueue();
  if (items.length === 0) return;

  // Notify start
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_STARTED', data: { count: items.length } });
  });

  let successCount = 0;
  let failCount = 0;

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(item.authHeader ? { Authorization: item.authHeader } : {}),
        },
        body: JSON.stringify(item.body),
      });

      if (response.ok || response.status === 401) {
        // 401 = token expired, remove from queue anyway
        successCount++;
      } else {
        failCount++;
      }
    } catch (err) {
      failCount++;
      console.error('SW: Sync failed for item:', err);
    }
  }

  // Clear queue if all succeeded
  if (failCount === 0) {
    await clearQueue();
  }

  // Notify completion
  const updatedClients = await self.clients.matchAll();
  updatedClients.forEach((client) => {
    client.postMessage({
      type: 'SYNC_COMPLETED',
      data: { successCount, failCount, total: items.length },
    });
  });
}

// ========================
// Helper
// ========================
function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/.test(pathname) ||
    pathname.startsWith('/_next/static/');
}
