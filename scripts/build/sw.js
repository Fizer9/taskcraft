// Лагерь без сети. При установке скачивает все файлы своей версии, поэтому игра открывается
// без интернета уже после первого визита. Страница берётся из сети, если та отвечает быстро,
// остальное из кэша. Список файлов и версию вписывает scripts/build/finish.mjs.
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `lager-${VERSION}`;
/** Сколько ждать страницу из сети, прежде чем открыть сохранённую. */
const PAGE_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  // На одном адресе github.io живут и другие сайты: трогаем только свои кэши.
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lager-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(req.mode === 'navigate' ? page(req) : file(req));
});

async function page(req) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match('./', { ignoreVary: true });
  const network = fetch(req);
  if (!saved) return network;
  const slow = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT, saved));
  return Promise.race([network.then((res) => (res.ok ? res : saved), () => saved), slow]);
}

async function file(req) {
  const cache = await caches.open(CACHE);
  // Картинки лагеря просят с ?v=версия: в кэше они лежат без него.
  return (await cache.match(req, { ignoreSearch: true, ignoreVary: true })) || fetch(req);
}
