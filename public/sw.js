const CACHE_NAME = 'lllm-sh-v3';

const PRECACHE_URLS = [
  './',
  './style.css',
  './js/app.js',
  './js/state.js',
  './js/models.js',
  './js/terminal.js',
  './js/perf.js',
  './js/threads.js',
  './js/runtime.js',
  './js/commands.js',
  './js/bench.js',
  './js/cache.js',
  './js/memory.js',
  './js/voice.js',
  './js/attachments.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Static hosts that can't set response headers (GitHub Pages) still need
// COOP/COEP for cross-origin isolation → SharedArrayBuffer → multi-thread
// wllama. Inject them on the page itself; on hosts that already send them
// (public/_headers on Cloudflare Pages) this is a no-op.
function withIsolationHeaders(response) {
  if (!response || response.type === 'opaque' || response.status === 0) return response;
  if (response.headers.get('Cross-Origin-Embedder-Policy')) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Let wllama handle model downloads via its own cache (IndexedDB)
  if (url.hostname === 'huggingface.co' || url.hostname === 'cdn-lfs.huggingface.co') {
    return;
  }

  // Network-first for same-origin HTML/JS (deploys take effect immediately)
  if (url.origin === self.location.origin && (url.pathname.endsWith('.js') || url.pathname.endsWith('/') || url.pathname.endsWith('.html'))) {
    const isPage = event.request.mode === 'navigate';
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
        .then((response) => (isPage ? withIsolationHeaders(response) : response))
    );
    return;
  }

  // Cache-first for CDN resources (wllama WASM, JS modules, fonts)
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Cache-first for everything else (fonts etc.)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request);
    })
  );
});
