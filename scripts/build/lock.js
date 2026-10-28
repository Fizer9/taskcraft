// Замок на сайте. Код игры лежит на сервере зашифрованным, пароль превращается в ключ и открывает
// его прямо в браузере. Ключ можно запомнить на устройстве, тогда пароль больше не спросят.
// Соль и число итераций вписывает scripts/build/finish.mjs, они те же, что при шифровании.
(() => {
  const SALT = '__SALT__';
  const ITERATIONS = __ITERATIONS__;
  const KEY = 'taskcraft-lager-key';

  const app = document.currentScript.dataset.app;
  const lock = document.getElementById('lock');
  const form = document.getElementById('lock-form');
  const pass = document.getElementById('lock-pass');
  const keep = document.getElementById('lock-keep');
  const btn = document.getElementById('lock-btn');
  const msg = document.getElementById('lock-msg');

  const enc = new TextEncoder();
  let code = null;
  const load = () => {
    code ??= fetch(app).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    code.catch(() => (code = null));
    return code;
  };

  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  function savedKey() {
    try {
      return localStorage.getItem(KEY) || sessionStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  function remember(raw, forever) {
    try {
      (forever ? localStorage : sessionStorage).setItem(KEY, toB64(raw));
    } catch {
      // Не запомнили: в следующий раз спросим пароль ещё раз.
    }
  }

  function forget() {
    try {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(KEY);
    } catch {
      // Нечего забывать.
    }
  }

  async function derive(password) {
    const base = await crypto.subtle.importKey('raw', enc.encode(password.trim().normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
    return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITERATIONS }, base, 256);
  }

  /** Расшифровать код игры. Неверный ключ даёт OperationError. */
  async function unlock(raw) {
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const data = await load();
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12));
  }

  function run(js) {
    lock.remove();
    import(URL.createObjectURL(new Blob([js], { type: 'text/javascript' }))).catch((err) => {
      const p = document.createElement('p');
      p.className = 'lock-fail';
      p.textContent = `Игра не запустилась (${err && err.message}). Обнови страницу.`;
      document.body.append(p);
    });
  }

  function show(text) {
    lock.hidden = false;
    msg.textContent = text || '';
    btn.disabled = false;
    btn.textContent = 'Войти';
    // autofocus не сработает: пока скрипт не решил, нужен ли пароль, форма скрыта.
    if (!lock.contains(document.activeElement)) pass.focus();
  }

  const offline = 'Не получилось загрузить игру. Проверь интернет и попробуй ещё раз.';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pass.value.trim()) return;
    btn.disabled = true;
    btn.textContent = 'Открываю…';
    msg.textContent = '';
    let js;
    let raw;
    try {
      raw = await derive(pass.value);
      js = await unlock(raw);
    } catch (err) {
      show(err && err.name === 'OperationError' ? 'Пароль не подошёл.' : offline);
      pass.select();
      return;
    }
    remember(raw, keep.checked);
    run(js);
  });

  async function start() {
    if (!window.crypto || !crypto.subtle) {
      show('Этот браузер не умеет открывать Лагерь. Обнови его или открой сайт в другом.');
      form.querySelector('fieldset').disabled = true;
      return;
    }
    const saved = savedKey();
    if (!saved) return show();
    let js;
    try {
      js = await unlock(fromB64(saved));
    } catch (err) {
      // Пароль сменили: старый ключ больше не подходит.
      if (err && err.name === 'OperationError') forget();
      return show(err && err.name === 'OperationError' ? 'Пароль сменился, введи новый.' : offline);
    }
    run(js);
  }

  void start();
})();
