// sw.js (ROOT)
// Scop: evită cache-ul vechi pentru fișierele locale JS/CSS/HTML.
// Pentru .js folosim mereu NETWORK + cache:"no-store".

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Interceptăm DOAR resursele de pe același origin (site-ul tău)
  if (url.origin !== self.location.origin) return;

  const isHtml =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  const isJs =
    req.destination === "script" ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".mjs");

  const isCss =
    req.destination === "style" ||
    url.pathname.endsWith(".css");

  // 1) Pentru HTML: network-first (ca să vezi update-uri de pagină)
  if (isHtml) {
    event.respondWith(
      fetch(req, { cache: "no-store" }).catch(() => caches.match(req))
    );
    return;
  }

  // 2) Pentru JS: *mereu* no-store (asta te scapă de “telefonul ține minte”)
  if (isJs) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
    );
    return;
  }

  // 3) Pentru CSS: no-store (opțional, dar ajută la stiluri)
  if (isCss) {
    event.respondWith(
      fetch(req, { cache: "no-store" })
    );
    return;
  }

  // Restul: lasă default (imagini etc.)
});
