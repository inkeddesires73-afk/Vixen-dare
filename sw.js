const CACHE_NAME = 'vixen-dare-cache-v36';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './tasks.js',
  './manifest.webmanifest?v=33',
  './guide.html',
  './Vixen.png',
  './icon-192.png',
  './icon-512.png',
  './assets/levels/level-1.png',
  './assets/levels/level-2.png',
  './assets/levels/level-3.png',
  './assets/levels/level-4.png',
  './assets/levels/level-5.png',
  './assets/concepts/vixen-fox.png',
  './assets/concepts/stag-deer.png',
  './assets/concepts/pride-spark.png',
  './assets/concepts/hotwife-stiletto.png',
  './assets/concepts/hotwife-balance.png',
  './assets/concepts/hotwife-observer.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  // Startsidan ska alltid kontrolleras mot nätet först så att en installerad
  // app inte kan fastna på en gammal välkomstsida efter en uppdatering.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)));
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response;
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
