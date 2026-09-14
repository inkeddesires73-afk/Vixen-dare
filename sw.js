const CACHE_NAME = 'vixen-dare-cache-v54';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './cloud-config.js',
  './cloud-sync.js',
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

const CAR_SCENE_CLEANUP = `
(() => {
  if (typeof VIXEN_DATABASE === 'undefined' || !Array.isArray(VIXEN_DATABASE)) return;
  for (const task of VIXEN_DATABASE) {
    if (typeof task.text !== 'string') continue;
    const number = Number((task.id.match(/\\d+$/) || ['0'])[0]);
    const observer = number % 2 === 0
      ? 'medan din partner ser på från framsätet'
      : 'medan din partner tittar på från framsätet';
    task.text = task.text
      .replace(/medan din partner (?:ser|tittar) bakåt från framsätet/g, observer)
      .replace(/medan din partner sitter i framsätet och (?:ser|tittar) bakåt/g, observer)
      .replace(/din partner sitter i framsätet och ser bakåt/g, 'din partner ser på från framsätet')
      .replace(/din partner sitter i framsätet och tittar bakåt/g, 'din partner tittar på från framsätet');
  }
})();
`;

async function patchCloudConfig(response) {
  if (!response || response.status !== 200) return response;
  const text = await response.text();
  return new Response(`${text}\n${CAR_SCENE_CLEANUP}`, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('vixen-dare-cache-') && key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  // Kort-override-filen patchas efter att dess egna overrides har körts.
  // Då träffas även kort som fortfarande kommer från grundbanken i tasks.js.
  if (requestUrl.pathname.endsWith('/cloud-config.js')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(async response => {
          const patched = await patchCloudConfig(response);
          if (patched && patched.status === 200) {
            const copy = patched.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
          }
          return patched;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached ? patchCloudConfig(cached) : Response.error();
        })
    );
    return;
  }

  // Startsidan ska alltid kontrolleras mot nätet först så att en installerad
  // app inte kan fastna på en gammal välkomstsida efter en uppdatering.
  if (event.request.mode === 'navigate') {
    const page = new URL(event.request.url);
    page.search = '';
    if (page.pathname.endsWith('/')) page.pathname += 'index.html';
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(page.href, copy)));
        }
        return response;
      }).catch(async () => (await caches.match(page.href)) || Response.error())
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
