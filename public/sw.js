const CACHE_NAME = "profia-static-v2";
const OFFLINE_PAGE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([OFFLINE_PAGE, "/favicon.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("profia-static-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedPage = await caches.match(OFFLINE_PAGE);
        if (cachedPage) return cachedPage;
        throw new Error("The device is offline and no offline page is available.");
      }),
    );
    return;
  }

  const isPublicAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname === "/favicon.png";
  if (!isPublicAsset || !["script", "style", "image", "font"].includes(request.destination)) return;

  event.respondWith(
    caches.match(request).then(
      (cachedResponse) =>
        cachedResponse ??
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const responseToCache = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return response;
        }),
    ),
  );
});
