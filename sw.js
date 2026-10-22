// Service worker de Mr Cooook : « cache puis mise à jour en arrière-plan » (stale-while-revalidate).
// Ne lit que son propre cache et les fichiers du même site ; aucune ressource externe.
"use strict";
const CACHE = "mrcooook-v1";
const PRECACHE = ["./", "./index.html"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(cache => cache.match(req).then(enCache => {
    const reseau = fetch(req).then(rep => {
      if (rep && rep.ok) cache.put(req, rep.clone());
      return rep;
    }).catch(() => enCache);
    if (enCache) { e.waitUntil(reseau); return enCache; }
    return reseau;
  })));
});
