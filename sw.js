'use strict';
/* オフラインでも遊べるようにする(ホーム画面に入れたあと、電波がなくても起動する)。
   アプリの画面・問題・レッスンのファイルと アイコン類を覚えておく。
   ゲームを直しただけなら VERSION は そのままでいい(開くたびに、まずネットで最新を取りにいくので)。
   FILES(覚えるファイル)を変えたときだけ VERSION を 1つ上げる(古い覚えを 一斉に捨てる)。 */
const VERSION = 'boki3-v1';
const FILES = ['./', 'index.html', 'install.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png', 'css/app.css', 'js/core.js', 'js/accounts.js', 'js/figs.js', 'js/engine.js', 'js/app.js', 'js/data/q-a.js', 'js/data/q-b.js', 'js/data/q-c.js', 'js/data/lessons-a.js', 'js/data/lessons-b.js', 'js/data/glossary-a.js', 'js/data/glossary-b.js', 'js/data/tips.js', 'js/data/exam.js', 'shots/1.jpg', 'shots/2.jpg', 'shots/3.jpg', 'shots/4.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

/* 開くときは まずネットで最新を取りにいく。つながらなければ 覚えているものを出す。 */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
