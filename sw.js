/* Pie Chart Studio service worker.

   The whole app is one HTML file, so "offline capable" mostly means keeping a
   good copy of that file and handing it back when the network is gone.

   Two strategies, chosen per request:

   - HTML: network first. The app ships several times a day, and a cache-first
     document would pin visitors to an old build until they cleared storage.
     The network copy wins whenever it is reachable; the cache is the fallback.
   - Everything else (icons, images, manifest): cache first. These are static
     and cheap to keep, so serve them instantly and refresh in the background.

   Bump CACHE when the precache list changes: the old cache is deleted on
   activate, so a new name is what actually retires stale entries. */

var CACHE = "pcs-v1";

/* Kept small on purpose. index.html is the app; the rest are the icons the
   browser and the installed app need. The big social images are deliberately
   left out - they are only ever fetched by crawlers, never by the app. */
var PRECACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icon-512.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      // addAll() rejects the whole install if any single file 404s, which
      // would leave the site with no worker at all. Add them individually and
      // let a missing one be skipped instead.
      return Promise.all(PRECACHE.map(function(url){
        return c.add(new Request(url, {cache: "reload"}))["catch"](function(){});
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return k === CACHE ? null : caches["delete"](k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function isHTML(req){
  if(req.mode === "navigate") return true;
  var a = req.headers.get("accept") || "";
  return a.indexOf("text/html") > -1;
}

self.addEventListener("fetch", function(e){
  var req = e.request;

  // Only GET, and only our own origin. Anything else (a POST, another host)
  // is none of the worker's business.
  if(req.method !== "GET") return;
  if(new URL(req.url).origin !== self.location.origin) return;

  if(isHTML(req)){
    // Network first: always prefer a fresh build, fall back to the last good
    // copy, and fall back again to the cached shell for a deep link.
    e.respondWith(
      fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put("/index.html", copy); });
        }
        return res;
      })["catch"](function(){
        return caches.match(req).then(function(hit){
          return hit || caches.match("/index.html") || caches.match("/");
        });
      })
    );
    return;
  }

  // Everything else: cache first, refreshed quietly in the background so the
  // next visit gets the newer file without ever blocking this one.
  e.respondWith(
    caches.match(req).then(function(hit){
      var net = fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      })["catch"](function(){ return hit; });
      return hit || net;
    })
  );
});
