import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUR, MINUTE } from '../src/game/rules';
import { addRoutine, addTask, complete, findTask, newState, pause, removeQuest, start, updateTask } from '../src/game/state';
import { mergeGames } from '../src/game/merge';
import { Store, type Storage } from '../src/game/store';
import type { State } from '../src/game/types';
import { SAVE_FILE, type Fetch } from '../src/sync/github';
import { Sync, type Prefs } from '../src/sync/sync';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();

/**
 * Поддельный GitHub: гисты в памяти с историей версий, токены и их владельцы, можно «выключить сеть».
 * Если задан net.expiry, GitHub сообщает срок токена в заголовке, как настоящий.
 */
function fakeGitHub() {
  const gists = new Map<string, { content: string; updated: number; versions: { version: string; content: string }[] }>();
  const tokens: Record<string, string> = { good: 'igor' };
  let n = 0;
  let v = 0;
  let clock = 0;
  const net = { down: false, writes: 0, expiry: null as string | null };
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });
  const history = (g: { versions: { version: string }[] }) => [...g.versions].reverse().map((x) => ({ version: x.version }));
  const fetchFn: Fetch = async (url, init) => {
    if (net.down) throw new TypeError('Failed to fetch');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const login = tokens[(headers.Authorization ?? '').replace('Bearer ', '')];
    if (!login) return json({ message: 'Bad credentials' }, 401);
    const u = new URL(url);
    const method = init?.method ?? 'GET';
    const m = u.pathname.match(/^\/gists\/(\w+)$/);
    const rev = u.pathname.match(/^\/gists\/(\w+)\/(\w+)$/);
    if (u.pathname === '/user') return json({ login }, 200, net.expiry ? { 'GitHub-Authentication-Token-Expiration': net.expiry } : {});
    if (u.pathname === '/gists' && method === 'GET') {
      return json([...gists.entries()].map(([id, g]) => ({ id, updated_at: new Date(g.updated).toISOString(), files: { [SAVE_FILE]: {} } })));
    }
    if (u.pathname === '/gists' && method === 'POST') {
      const body = JSON.parse(init!.body as string);
      const id = `g${++n}`;
      const content = body.files[SAVE_FILE].content;
      gists.set(id, { content, updated: ++clock, versions: [{ version: `v${++v}`, content }] });
      net.writes++;
      return json({ id }, 201);
    }
    if (rev && method === 'GET') {
      const x = gists.get(rev[1])?.versions.find((y) => y.version === rev[2]);
      return x ? json({ files: { [SAVE_FILE]: { content: x.content, truncated: false } } }) : json({ message: 'Not Found' }, 404);
    }
    if (m && method === 'GET') {
      const g = gists.get(m[1]);
      return g ? json({ files: { [SAVE_FILE]: { content: g.content, truncated: false } }, history: history(g) }) : json({ message: 'Not Found' }, 404);
    }
    if (m && method === 'PATCH') {
      const g = gists.get(m[1]);
      if (!g) return json({ message: 'Not Found' }, 404);
      g.content = JSON.parse(init!.body as string).files[SAVE_FILE].content;
      g.updated = ++clock;
      g.versions.push({ version: `v${++v}`, content: g.content });
      net.writes++;
      return json({ id: m[1], history: history(g) });
    }
    if (m && method === 'DELETE') {
      return gists.delete(m[1]) ? new Response(null, { status: 204 }) : json({ message: 'Not Found' }, 404);
    }
    return json({ message: 'Not Found' }, 404);
  };
  const saved = (): State => JSON.parse([...gists.values()][0].content).state;
  return { fetchFn, gists, net, saved, tokens };
}

/** Устройство: своё хранилище, свои часы, свой Sync, общий GitHub. */
function device(gh: ReturnType<typeof fakeGitHub>, name: string, now: { t: number }, fetchFn: Fetch = gh.fetchFn) {
  let raw: string | null = null;
  let prefs: string | null = null;
  const storage: Storage = { load: () => raw, save: (j) => { raw = j; } };
  const p: Prefs = { load: () => prefs, save: (j) => (prefs = j) };
  const store = new Store(storage, () => now.t);
  const sync = new Sync(store, p, fetchFn, name);
  return { store, sync };
}

const titles = (s: State) => s.tasks.map((t) => t.title).sort();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('сохранение в GitHub', () => {
  it('первое подключение создаёт гист, второе устройство находит его по токену', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    pc.store.act((s, t) => addTask(s, t, { title: 'Сдать модуль', questId: s.quests[0].id, day: s.day }));
    await pc.sync.connect('good');
    expect(gh.gists.size).toBe(1);
    expect(titles(gh.saved())).toEqual(['Сдать модуль']);
    expect(pc.sync.status.login).toBe('igor');

    // На телефоне новая пустая игра: она молча заменяется игрой из GitHub.
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect(' good ');
    expect(gh.gists.size).toBe(1);
    expect(phone.store.state.gameId).toBe(pc.store.state.gameId);
    expect(titles(phone.store.state)).toEqual(['Сдать модуль']);
    expect(phone.sync.status.phase).toBe('ok');
  });

  it('сохранение в браузере сломалось: игра возвращается из GitHub целиком', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    pc.store.act((s, t) => addTask(s, t, { title: 'Сдать модуль', questId: s.quests[0].id, day: s.day }));
    await pc.sync.connect('good');

    // Новая пустая игра после «Взять игру из GitHub» не сливается с гистом и не затирает его.
    pc.store.startOver();
    pc.sync.pullFresh();
    await pc.sync.syncNow();
    expect(titles(pc.store.state)).toEqual(['Сдать модуль']);
    expect(titles(gh.saved())).toEqual(['Сдать модуль']);
    pc.store.act((s, t) => addTask(s, t, { title: 'Ещё одна', questId: s.quests[0].id, day: s.day }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(titles(gh.saved())).toEqual(['Ещё одна', 'Сдать модуль']);
  });

  it('неверный токен не подключается и объясняет почему', async () => {
    const gh = fakeGitHub();
    const pc = device(gh, 'компьютер', { t: at(9) });
    await expect(pc.sync.connect('bad')).rejects.toThrow('GitHub не принял токен');
    expect(pc.sync.connected).toBe(false);
  });

  it('в гисте игра из новой версии или испорченная: ошибка говорит, что именно', async () => {
    const gh = fakeGitHub();
    const pc = device(gh, 'компьютер', { t: at(9) });
    await pc.sync.connect('good');
    const gist = [...gh.gists.values()][0];
    const spoil = (change: (doc: { stamp: string; state: Record<string, unknown> }) => void) => {
      const doc = JSON.parse(gist.content);
      doc.stamp = `${doc.stamp}-other`;
      change(doc);
      gist.content = JSON.stringify(doc);
    };
    spoil((doc) => (doc.state.v = 99));
    await pc.sync.syncNow();
    expect(pc.sync.status.error).toBe('В GitHub игра из более новой версии Лагеря. Обнови страницу');
    spoil((doc) => {
      doc.state.v = 1;
      delete doc.state.tasks;
    });
    await pc.sync.syncNow();
    expect(pc.sync.status.error).toBe('В гисте повреждённое сохранение');
  });

  it('действие уходит в GitHub, другое устройство его забирает', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    await pc.sync.connect('good');
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');

    now.t = at(10);
    phone.store.act((s, t) => addTask(s, t, { title: 'Купить хлеб', questId: s.quests[2].id }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(titles(gh.saved())).toEqual(['Купить хлеб']);

    const before = gh.net.writes;
    await pc.sync.syncNow();
    expect(titles(pc.store.state)).toEqual(['Купить хлеб']);
    // Компьютер ничего не делал, поэтому ничего и не пишет.
    expect(gh.net.writes).toBe(before);
  });

  it('оба устройства меняли игру без связи: задачи обеих сторон остаются, золото складывается', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    const ids = pc.store.act((s, t) => [
      addTask(s, t, { title: 'Отчёт', questId: s.quests[0].id, day: s.day }),
      addTask(s, t, { title: 'Зарядка', questId: s.quests[1].id, day: s.day }),
    ]);
    await pc.sync.connect('good');
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');

    gh.net.down = true;
    now.t = at(11);
    pc.store.act((s, t) => complete(s, t, ids[0]));
    pc.store.act((s, t) => addTask(s, t, { title: 'Созвон', questId: s.quests[0].id }));
    now.t = at(12);
    phone.store.act((s, t) => complete(s, t, ids[1]));
    phone.store.act((s) => updateTask(s, ids[0], { title: 'Отчёт за октябрь' }));
    phone.store.act((s, t) => addTask(s, t, { title: 'Аптека', questId: s.quests[2].id }));
    await pc.sync.syncNow();
    expect(pc.sync.status.phase).toBe('offline');

    gh.net.down = false;
    await pc.sync.syncNow();
    await phone.sync.syncNow();
    await pc.sync.syncNow();
    for (const d of [pc, phone]) {
      const s = d.store.state;
      expect(titles(s)).toEqual(['Аптека', 'Зарядка', 'Отчёт за октябрь', 'Созвон']);
      expect(findTask(s, ids[0])!.status).toBe('done');
      expect(findTask(s, ids[1])!.status).toBe('done');
      // Обе награды: 25 золота за задачу I уровня с каждой стороны.
      expect(s.hero.gold).toBe(50);
      expect(s.log[s.day].done).toBe(2);
    }
  });

  it('два устройства пишут одновременно: задачи обеих сторон остаются', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    // Запись компьютера можно придержать: он уже прочитал гист, но ещё не записал.
    const hold = { on: false, release: null as null | (() => void) };
    const pcFetch: Fetch = async (url, init) => {
      if (hold.on && init?.method === 'PATCH') {
        hold.on = false;
        await new Promise<void>((r) => (hold.release = r));
      }
      return gh.fetchFn(url, init);
    };
    const pc = device(gh, 'компьютер', now, pcFetch);
    await pc.sync.connect('good');
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');

    now.t = at(10);
    pc.store.act((s, t) => addTask(s, t, { title: 'С компьютера', questId: s.quests[0].id }));
    phone.store.act((s, t) => addTask(s, t, { title: 'С телефона', questId: s.quests[0].id }));
    pc.store.act((s) => (s.hero.gold += 10));
    phone.store.act((s) => (s.hero.gold += 5));
    hold.on = true;
    const pcRun = pc.sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    await phone.sync.syncNow(); // телефон записал своё, пока компьютер ждал
    hold.release!();
    await pcRun; // компьютер записал поверх, заметил это по истории гиста и слил
    await vi.advanceTimersByTimeAsync(10_000);
    await phone.sync.syncNow();
    await pc.sync.syncNow();

    expect(titles(gh.saved())).toEqual(['С компьютера', 'С телефона']);
    expect(titles(phone.store.state)).toEqual(['С компьютера', 'С телефона']);
    expect(titles(pc.store.state)).toEqual(['С компьютера', 'С телефона']);
    expect(gh.saved().hero.gold).toBe(15);
    expect(pc.store.state.hero.gold).toBe(15);
    expect(phone.store.state.hero.gold).toBe(15);
  });

  it('таймер с другого устройства досчитывается, а не удваивается', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    const id = pc.store.act((s, t) => addTask(s, t, { title: 'Код', questId: s.quests[0].id, day: s.day }));
    await pc.sync.connect('good');
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');

    pc.store.act((s, t) => start(s, t, id));
    await vi.advanceTimersByTimeAsync(5000);
    now.t = at(9, 30);
    await phone.sync.syncNow();
    expect(findTask(phone.store.state, id)!.spentMs).toBeCloseTo(30 * MINUTE, -4);

    now.t = at(9, 40);
    pc.store.act((s, t) => pause(s, t));
    await vi.advanceTimersByTimeAsync(5000);
    now.t = at(9, 50);
    phone.store.tick();
    await phone.sync.syncNow();
    expect(findTask(phone.store.state, id)!.spentMs).toBeCloseTo(40 * MINUTE, -4);
  });

  it('в GitHub другая игра: спрашивает и делает, что выбрали', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    pc.store.act((s, t) => addTask(s, t, { title: 'С компьютера', questId: s.quests[0].id }));
    await pc.sync.connect('good');

    const phone = device(gh, 'телефон', now);
    phone.store.act((s, t) => addTask(s, t, { title: 'С телефона', questId: s.quests[0].id }));
    await phone.sync.connect('good');
    expect(phone.sync.status.phase).toBe('conflict');
    expect(phone.sync.status.conflict?.device).toBe('компьютер');
    expect(titles(gh.saved())).toEqual(['С компьютера']);

    await phone.sync.resolve('local');
    expect(titles(gh.saved())).toEqual(['С телефона']);

    // Теперь уже компьютер видит другую игру и берёт её.
    pc.store.act((s, t) => addTask(s, t, { title: 'Ещё с компьютера', questId: s.quests[0].id }));
    await pc.sync.syncNow();
    expect(pc.sync.status.phase).toBe('conflict');
    await pc.sync.resolve('remote');
    expect(titles(pc.store.state)).toEqual(['С телефона']);
    expect(pc.store.state.gameId).toBe(phone.store.state.gameId);
  });

  it('игра из файла уходит в GitHub целиком', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    pc.store.act((s, t) => addTask(s, t, { title: 'Старое', questId: s.quests[0].id }));
    await pc.sync.connect('good');

    const file = newState(at(8));
    addTask(file, at(8), { title: 'Из файла', questId: file.quests[0].id });
    pc.sync.replaceGame(file);
    await vi.advanceTimersByTimeAsync(10);
    expect(titles(gh.saved())).toEqual(['Из файла']);
    expect(pc.sync.status.phase).toBe('ok');
  });
});

describe('токен', () => {
  it('срок токена: из ответа GitHub, а если его не видно, год от подключения', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    await pc.sync.connect('good');
    expect(pc.sync.tokenExpiry).toEqual({ day: '2027-10-24', guessed: true });
    pc.sync.setTokenExpiry('2027-09-01');
    expect(pc.sync.tokenExpiry).toEqual({ day: '2027-09-01', guessed: false });

    gh.net.expiry = '2027-03-15 10:00:00 UTC';
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');
    expect(phone.sync.tokenExpiry).toEqual({ day: '2027-03-15', guessed: false });
  });

  it('новый токен того же аккаунта заменяет истёкший, сохранение снова идёт', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    await pc.sync.connect('good');
    delete gh.tokens.good;
    pc.store.act((s, t) => addTask(s, t, { title: 'Отчёт', questId: s.quests[0].id, day: s.day }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(pc.sync.status.phase).toBe('error');
    expect(pc.sync.status.error).toMatch('токен');

    gh.tokens.other = 'masha';
    await expect(pc.sync.replaceToken('other')).rejects.toThrow('аккаунта masha');
    await expect(pc.sync.replaceToken('nope')).rejects.toThrow('не принял токен');
    expect(pc.sync.status.phase).toBe('error');

    gh.tokens.fresh = 'igor';
    now.t = at(10);
    await pc.sync.replaceToken(' fresh ');
    expect(pc.sync.status.phase).toBe('ok');
    expect(titles(gh.saved())).toEqual(['Отчёт']);
    expect(pc.sync.tokenExpiry).toEqual({ day: '2027-10-24', guessed: true });
  });

  it('гист можно удалить; без сети он остаётся, и GitHub остаётся подключён', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    await pc.sync.connect('good');
    gh.net.down = true;
    await expect(pc.sync.removeSave()).rejects.toThrow('Нет связи');
    expect(pc.sync.connected).toBe(true);
    expect(gh.gists.size).toBe(1);
    gh.net.down = false;
    await pc.sync.removeSave();
    expect(gh.gists.size).toBe(0);
    expect(pc.sync.connected).toBe(false);
    expect(pc.sync.status.phase).toBe('off');
  });
});

describe('обновление игры', () => {
  it('настройки сохранения от прошлой версии игры читаются, повторяющиеся задачи приходят с другого устройства', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    let raw: string | null = null;
    let prefs: string | null = null;
    const storage: Storage = { load: () => raw, save: (j) => { raw = j; } };
    const p: Prefs = { load: () => prefs, save: (j) => (prefs = j) };
    const pc = new Sync(new Store(storage, () => now.t), p, gh.fetchFn, 'компьютер');
    await pc.connect('good');
    pc['store'].act((s, t) => addTask(s, t, { title: 'Отчёт', questId: s.quests[0].id, day: s.day }));
    await vi.advanceTimersByTimeAsync(5000);
    // Так их записала 0.2: версия для слияния без повторяющихся задач.
    const cfg = JSON.parse(prefs!);
    cfg.base.v = 1;
    delete cfg.base.routines;
    prefs = JSON.stringify(cfg);
    const old = JSON.parse(raw!);
    old.v = 1;
    delete old.routines;
    raw = JSON.stringify(old);

    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');
    now.t = at(10);
    phone.store.act((s, t) => addRoutine(s, t, { title: 'Почта', questId: null, level: 1, estimateMin: 15, at: null, repeat: { every: 'day' } }));
    await vi.advanceTimersByTimeAsync(5000);

    const store = new Store(storage, () => now.t);
    const again = new Sync(store, p, gh.fetchFn, 'компьютер');
    store.act((s, t) => addTask(s, t, { title: 'Созвон', questId: s.quests[0].id }));
    await again.syncNow();
    expect(again.status.phase).toBe('ok');
    expect(store.state.routines.map((r) => r.title)).toEqual(['Почта']);
    expect(titles(store.state)).toEqual(['Отчёт', 'Почта', 'Созвон']);
  });
});

describe('слияние версий', () => {
  function pair() {
    const base = newState(at(8));
    const id = addTask(base, at(8), { title: 'Задача', questId: base.quests[0].id, day: base.day });
    const copy = () => JSON.parse(JSON.stringify(base)) as State;
    return { base, local: copy(), remote: copy(), id };
  }

  it('разные поля одной задачи берутся с той стороны, где менялись', () => {
    const { base, local, remote, id } = pair();
    local.touchedAt = at(9);
    updateTask(local, id, { title: 'Новое имя' });
    remote.touchedAt = at(10);
    complete(remote, at(10), id);
    const m = mergeGames(base, local, remote, at(10, 5));
    const t = findTask(m, id)!;
    expect(t.title).toBe('Новое имя');
    expect(t.status).toBe('done');
    expect(t.reward?.gold).toBe(25);
    expect(m.hero.gold).toBe(25);
  });

  it('удалённый поход уходит, если его с тех пор не меняли', () => {
    const { base, local, remote } = pair();
    const q = base.quests[2].id;
    removeQuest(remote, q);
    expect(mergeGames(base, local, remote, at(9)).quests.some((x) => x.id === q)).toBe(false);
    local.quests.find((x) => x.id === q)!.name = 'Дом';
    expect(mergeGames(base, local, remote, at(9)).quests.find((x) => x.id === q)?.name).toBe('Дом');
  });

  it('часы работы за день складываются приростами', () => {
    const { base, local, remote, id } = pair();
    start(local, at(9), id);
    pause(local, at(10));
    const other = addTask(remote, at(9), { title: 'Другая', questId: remote.quests[1].id, day: remote.day });
    start(remote, at(11), other);
    pause(remote, at(11, 30));
    const m = mergeGames(base, local, remote, at(12));
    expect(m.log[m.day].workedMs).toBe(HOUR + 30 * MINUTE);
  });
});
