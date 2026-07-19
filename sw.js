// Service worker — makes the app installable, loads the shell fast, and plays
// concerts saved for offline (road trips!).
//
// Two caches:
//   CACHE  ("cac-v2")       — the app shell + runtime-cached pages/scripts.
//   MEDIA  ("cac-media-v1") — song audio, filled ONLY by the "Save for offline"
//                             button in the app. Never auto-filled by playback.
const CACHE = "cac-v2";
const MEDIA = "cac-media-v1";
const SHELL = [
  "./", "./index.html", "./logo.png", "./icon.png", "./manifest.json",
  // React itself must be cached or the app can't boot offline.
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
];

self.addEventListener("install", (e) => {
  // Cache each shell file best-effort — one miss shouldn't sink the rest.
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== MEDIA).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Serve a saved song from the media cache, honoring Range requests — iPhones
// refuse to play cached audio unless we answer their byte-range asks with 206s.
async function mediaFromCache(req) {
  const cache = await caches.open(MEDIA);
  const full = await cache.match(req.url);
  if (!full) return fetch(req); // not saved for offline — stream as usual
  const range = req.headers.get("range");
  if (!range) return full;
  const buf = await full.arrayBuffer();
  const total = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/i.exec(range);
  let start, end;
  if (m && m[1] === "" && m[2] !== "") {          // suffix range: last N bytes
    start = Math.max(0, total - parseInt(m[2], 10));
    end = total - 1;
  } else {
    start = m ? parseInt(m[1], 10) || 0 : 0;
    end = m && m[2] !== "" ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
  }
  if (start >= total || start > end)
    return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + total } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": full.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": "bytes " + start + "-" + end + "/" + total,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Song audio: saved-for-offline copies win; everything else streams normally.
  if (/r2\.dev/.test(req.url)) {
    e.respondWith(mediaFromCache(req));
    return;
  }

  // API calls: always network (fresh songs, fresh concerts). When offline, the
  // app itself falls back to the concert copy kept in localStorage.
  if (/\/\.netlify\/functions\//.test(req.url)) return;

  // Page loads (including ?concert=... links): network-first, and when offline
  // fall back to the cached app shell so saved concerts still open.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () =>
          (await caches.match(req, { ignoreSearch: true })) || caches.match("./index.html")
        )
    );
    return;
  }

  // Everything else: network-first (so updates always show), cache fallback.
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
