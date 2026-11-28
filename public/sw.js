/* TrustPay AI — Service Worker tối giản cho PWA.
 * - Network-first: luôn lấy bản mới nhất từ máy chủ; chỉ dùng bản lưu khi mất mạng.
 * - Không bao giờ lưu phản hồi /api/* (dữ liệu giao dịch, phân tích rủi ro).
 * - Chỉ lưu yêu cầu GET cùng origin.
 */
const CACHE_NAME = "trustpay-ai-shell-v2";
const PRECACHE = ["/", "/manifest.json", "/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Bỏ qua /api/* (dữ liệu giao dịch) và tệp cài đặt .apk (tải thẳng từ máy chủ, không lưu cache).
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.endsWith(".apk")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === "navigate") return caches.match("/");
          return Response.error();
        }),
      ),
  );
});
