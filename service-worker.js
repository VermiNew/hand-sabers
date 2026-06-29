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
    const network = fetch(event.request).then(async response => {
      if (response.ok || response.type === 'opaque') {
        await cache.put(event.request, response.clone());
      }
      return response;
    });

    if (cached) {
      event.waitUntil(network.catch(() => undefined));
      return cached;
    }
    return network;
  })());
});
