// Blunder Buster service worker: makes the app open and work offline (puzzles, training, reviews).
// Your data comes from Firestore's own offline copy; this file only caches the app itself.
//
// - Pages: network first (always the latest deploy), the cached copy when offline.
// - /_next/static: never changes once deployed (hashed names), so cache first.
// - Everything else of ours (Stockfish, opening book, icons): cached copy, refreshed in the background.
// Bump VERSION to drop every cache on the next visit.

const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
/** Old hashed chunks pile up over deploys: keep the newest ones. */
const MAX_ASSETS = 400;
/** Slow network: show the cached page instead of waiting forever. */
const NETWORK_TIMEOUT = 4000;

/** Every page, so any of them opens offline even if you never visited it. */
const ROUTES = ["/", "/games", "/review", "/puzzles", "/train", "/train/endgames", "/train/boss", "/train/guess", "/coach", "/profile"];

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== PAGES && key !== ASSETS) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

/** Caches each page and the scripts and styles it needs. A failure doesn't block the install. */
async function precache() {
  const pages = await caches.open(PAGES);
  const assets = await caches.open(ASSETS);
  const needed = new Set(["/manifest.webmanifest", "/icons/icon-192.png", "/data/openings.json"]);
  await Promise.all(
    ROUTES.map(async (route) => {
      try {
        const res = await fetch(route, { cache: "no-cache" });
        if (!res.ok) return;
        await pages.put(route, res.clone());
        for (const m of (await res.text()).matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) needed.add(m[0]);
      } catch {
        // Offline during install: the page gets cached the next time you open it.
      }
    }),
  );
  await Promise.all(
    [...needed].map(async (url) => {
      if (await assets.match(url)) return;
      try {
        const res = await fetch(url);
        if (res.ok) await assets.put(url, res);
      } catch {
        // Same: picked up later.
      }
    }),
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Ours only (Firebase, Chess.com and Lichess handle themselves), no API calls, no writes.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") event.respondWith(page(request, url));
  else if (url.searchParams.has("_rsc") || request.headers.get("RSC")) event.respondWith(rsc(request, url));
  else if (url.pathname.startsWith("/_next/static/")) event.respondWith(cacheFirst(request));
  else event.respondWith(staleWhileRevalidate(request, event));
});

/** The page's path without the query: /review?id=… is the same page for every game. */
const pageKey = (url) => (url.pathname.length > 1 ? url.pathname.replace(/\/$/, "").replace(/\.html$/, "") : "/");

async function page(request, url) {
  const cache = await caches.open(PAGES);
  const key = pageKey(url);
  try {
    const res = await withTimeout(fetch(request), NETWORK_TIMEOUT);
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch {
    return (await cache.match(key)) ?? (await cache.match("/")) ?? offlinePage();
  }
}

/** Client-side navigation data (the next page's React payload). Offline, Next falls back to loading the page. */
async function rsc(request, url) {
  const cache = await caches.open(PAGES);
  const key = `${pageKey(url)}?rsc`;
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch {
    return (await cache.match(key)) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    trim(cache);
  }
  return res;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request, { ignoreSearch: true });
  const fresh = fetch(request)
    .then(async (res) => {
      if (res.ok && res.status === 200) await cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(fresh);
    return hit;
  }
  return (await fresh) ?? Response.error();
}

async function trim(cache) {
  const keys = await cache.keys();
  // Oldest first (insertion order).
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

function offlinePage() {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><body style="font-family:system-ui;background:#fbf3e4;color:#2b2118;display:grid;place-items:center;min-height:90vh;text-align:center">
<div><h1>You're offline</h1><p>Open Blunder Buster once with internet, and it will work offline after that.</p></div>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
