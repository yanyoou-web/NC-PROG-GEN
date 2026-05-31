// Service Worker for NC Program Generator
// キャッシュ戦略: Cache-First（オフライン動作対応）
// ※ HTTPS または localhost 環境でのみ動作します（file:// プロトコル不可）

const CACHE_NAME = "nc-gen-v1";

const CACHE_FILES = [
    "./index.html",
    "./assets/style.css",
    "./assets/app.js",
    "./assets/data.js",
    "./assets/debug.js",
    "./assets/preview.js",
    "./assets/i18n.js",
    "./assets/operator-hints.js",
    "./assets/icon.svg",
    "./テンプレート/data_template_G78.js",
    "./テンプレート/data_template_M40.js",
    "./テンプレート/data_template_M22.js",
    "./テンプレート/data_template_M18.js",
    "./テンプレート/data_template_M15.js",
    "./テンプレート/data_template_G78_MH.js",
    "./テンプレート/data_template_M40_MH.js",
    "./テンプレート/data_template_M22_MH.js",
    "./テンプレート/data_template_M18_MH.js",
    "./テンプレート/data_template_M15_MH.js",
    "./テンプレート/data_template_M12HGDR_MH.js",
    "./テンプレート/data_template_M12HSS_MH.js",
    "./テンプレート/data_template_M12BAITO_MH.js",
    "./テンプレート/data_template_M12HGDR.js",
    "./テンプレート/data_template_M12HSS.js",
    "./テンプレート/data_template_M12BAITO.js",
    "./テンプレート/data_template_Tube.js",
    "./テンプレート/data_template_M42X3_25175.js",
    "./テンプレート/data_template_M8_21.js",
    "./テンプレート/data_template_M8_31.js",
    "./テンプレート/data_template_G18_40.js",
    "./テンプレート/data_template_G18_42.js",
    "./テンプレート/data_template_G18_62.js",
    "./テンプレート/data_template_G18_655.js",
    "./テンプレート/data_template_G18_6175.js",
    "./テンプレート/data_template_G18_40-MH.js",
    "./テンプレート/data_template_G18_42-MH.js",
    "./テンプレート/data_template_G18_62-MH.js",
    "./テンプレート/data_template_G18_655-MH.js",
    "./テンプレート/data_template_G18_6175-MH.js",
    "./テンプレート/data_template_TOMESEN_M16.js",
    "./テンプレート/data_template_TOMESEN_M18.js",
    "./テンプレート/data_template_TOMESEN_M22.js",
    "./テンプレート/data_template_TOMESEN_M24.js",
    "./テンプレート/data_template_TOMESEN_M35.js",
];

// インストール: 全静的ファイルをキャッシュ
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(CACHE_FILES))
            .then(() => self.skipWaiting())
    );
});

// アクティベート: 古いキャッシュを削除
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((k) => k !== CACHE_NAME)
                        .map((k) => caches.delete(k))
                )
            )
            .then(() => self.clients.claim())
    );
});

// フェッチ: Cache-First → ネットワークフォールバック
self.addEventListener("fetch", (event) => {
    // POST など副作用のあるリクエストはキャッシュしない
    if (event.request.method !== "GET") return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;
            return fetch(event.request).then((response) => {
                // 正常なレスポンスをキャッシュに追加
                if (response && response.status === 200 && response.type === "basic") {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
