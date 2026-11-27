const CACHE = "als-trainer-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/app.js",
  "./js/engine.js",
  "./js/cases.js",
  "./js/causes.js",
  "./js/rhythm.js",
  "./js/explore-model.js",
  "./js/store.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./fonts/archivo-narrow-600.woff2",
  "./fonts/archivo-narrow-700.woff2",
  "./fonts/source-sans-400.woff2",
  "./fonts/source-sans-600.woff2",
  "./fonts/plex-mono-400.woff2",
  "./fonts/plex-mono-500.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  if (url.pathname.endsWith("/sw.js")) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (error) {
        if (event.request.mode === "navigate") {
          const fallback = await cache.match("./index.html");
          if (fallback) return fallback;
        }
        throw error;
      }
    }),
  );
});
