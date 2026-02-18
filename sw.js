const CACHE_NAME = "weather-pwa-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./src/style.css",
  "./src/app.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

// Instalación: precache del “app shell”
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activación: limpiar caches viejos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - App shell: cache-first
// - API (open-meteo): network-first con fallback a cache
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  const isOpenMeteoApi =
    url.hostname.includes("open-meteo.com") ||
    url.hostname.includes("open-meteo.com") ||
    url.hostname.includes("open-meteo.com") ||
    url.hostname.includes("open-meteo.com") ||
    url.hostname.includes("open-meteo.com") ||
    url.hostname.includes("open-meteo.com");

  // Nota: geocoding-api.open-meteo.com y api.open-meteo.com
  const isWeatherApi =
    url.hostname === "api.open-meteo.com" ||
    url.hostname === "geocoding-api.open-meteo.com";

  if (isWeatherApi) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(cacheFirst(req));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, fresh.clone());
  return fresh;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Si no hay nada cacheado de la API, falla “normal”:
    return new Response(
      JSON.stringify({ error: "offline-no-cache" }),
      { headers: { "Content-Type": "application/json" }, status: 503 }
    );
  }
}
