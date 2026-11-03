/// <reference lib="webworker" />
const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

const CACHE_NAME = 'lllm-sh-v4';

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

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  sw.skipWaiting();
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => sw.clients.claim())
  );
});

// Static hosts that can't set response headers (GitHub Pages) still need
// COOP/COEP for cross-origin isolation → SharedArrayBuffer → multi-thread
// wllama. Inject them on the page itself; on hosts that already send them
// (public/_headers on Cloudflare Pages) this is a no-op.
/** @param {Response | undefined} response */
function withIsolationHeaders(response) {
  if (!response || response.type === 'opaque' || response.status === 0) return response;
  if (response.headers.get('Cross-Origin-Embedder-Policy')) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

sw.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Let wllama handle model downloads via its own cache (IndexedDB)
  if (url.hostname === 'huggingface.co' || url.hostname === 'cdn-lfs.huggingface.co') {
    return;
  }

  // Network-first for the same-origin app shell (deploys take effect immediately)
  const isShell = url.origin === self.location.origin &&
    (event.request.mode === 'navigate' || /(\/|\.html|\.js|\.css|\.json)$/.test(url.pathname));
  if (isShell) {
    const isPage = event.request.mode === 'navigate';
    event.respondWith(
      fetch(event.request).then((response) => {
        // Never let a 404/500 mid-deploy overwrite the good cached copy.
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() =>
        // Offline: exact match, else (for page loads like ?utm=… or index.html) the app shell.
        caches.match(event.request, { ignoreSearch: isPage })
          .then((cached) => cached || (isPage ? caches.match('./') : undefined))
          .then((cached) => cached || Response.error())
      ).then((response) => (isPage ? withIsolationHeaders(response) : response))
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
