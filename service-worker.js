const MEDIAPIPE_CACHE_PREFIX = 'hand-sabers-mediapipe-';
const MEDIAPIPE_CACHE = `${MEDIAPIPE_CACHE_PREFIX}v1`;

function isMediaPipeAsset(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return (
    (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/@mediapipe/tasks-vision@')) ||
    (url.hostname === 'storage.googleapis.com' && url.pathname.startsWith('/mediapipe-models/hand_landmarker/'))
  );
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name.startsWith(MEDIAPIPE_CACHE_PREFIX) && name !== MEDIAPIPE_CACHE)
        .map(name => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (!isMediaPipeAsset(event.request)) return;

  event.respondWith((async () => {
    const cache = await caches.open(MEDIAPIPE_CACHE);
    const cached = await cache.match(event.request);

    if (cached) {
      event.waitUntil(
        fetch(event.request)
          .then(response => response.ok || response.type === 'opaque'
            ? cache.put(event.request, response)
            : undefined)
          .catch(() => undefined),
      );
      return cached;
    }

    const response = await fetch(event.request);
    if (response.ok || response.type === 'opaque') {
      event.waitUntil(cache.put(event.request, response.clone()));
    }
    return response;
  })());
});
