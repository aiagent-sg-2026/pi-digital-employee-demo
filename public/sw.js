/* Generated placeholders are replaced in dist by scripts/finalize-pwa.mjs. */
const APP_VERSION = "__PWA_VERSION__";
const BUILD_ID = "__PWA_BUILD_ID__";
const CACHE_NAME = `digital-employee-shell-${APP_VERSION}-${BUILD_ID}`;
const PRECACHE_PATHS = __PWA_PRECACHE__;
const scopeUrl = self.registration.scope;
const toScopeUrl = (path) => new URL(path, scopeUrl).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_PATHS.map(toScopeUrl))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("digital-employee-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
    return;
  }
  if (event.data?.type === "GET_VERSION" && event.ports?.[0]) {
    event.ports[0].postMessage({ version: APP_VERSION, buildId: BUILD_ID });
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/version.json") || url.pathname.endsWith("/sw.js")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: "no-store" });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request, { ignoreVary: true }))
          ?? (await caches.match(toScopeUrl("index.html"), { ignoreVary: true }))
          ?? (await caches.match(toScopeUrl("./"), { ignoreVary: true }))
          ?? Response.error();
      }
    })());
    return;
  }

  const staticDestination = ["script", "style", "image", "font", "manifest"].includes(request.destination);
  if (!staticDestination) return;
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreVary: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
