import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUR, MINUTE } from '../src/game/rules';
import { addTask, complete, findTask, newState, pause, removeQuest, start, updateTask } from '../src/game/state';
import { mergeGames } from '../src/game/merge';
import { Store, type Storage } from '../src/game/store';
import type { State } from '../src/game/types';
import { SAVE_FILE, type Fetch } from '../src/sync/github';
import { Sync, type Prefs } from '../src/sync/sync';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();

/** Поддельный GitHub: гисты в памяти, один правильный токен, можно «выключить сеть». */
function fakeGitHub() {
  const gists = new Map<string, { content: string; updated: number }>();
  let n = 0;
  let clock = 0;
  const net = { down: false, writes: 0 };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchFn: Fetch = async (url, init) => {
    if (net.down) throw new TypeError('Failed to fetch');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (headers.Authorization !== 'Bearer good') return json({ message: 'Bad credentials' }, 401);
    const u = new URL(url);
    const method = init?.method ?? 'GET';
    const m = u.pathname.match(/^\/gists\/(\w+)$/);
    if (u.pathname === '/user') return json({ login: 'igor' });
    if (u.pathname === '/gists' && method === 'GET') {
      return json([...gists.entries()].map(([id, g]) => ({ id, updated_at: new Date(g.updated).toISOString(), files: { [SAVE_FILE]: {} } })));
    }
    if (u.pathname === '/gists' && method === 'POST') {
      const body = JSON.parse(init!.body as string);
      const id = `g${++n}`;
      gists.set(id, { content: body.files[SAVE_FILE].content, updated: ++clock });
      net.writes++;
      return json({ id }, 201);
    }
    if (m && method === 'GET') {
      const g = gists.get(m[1]);
      return g ? json({ files: { [SAVE_FILE]: { content: g.content, truncated: false } } }) : json({ message: 'Not Found' }, 404);
    }
    if (m && method === 'PATCH') {
      const g = gists.get(m[1]);
      if (!g) return json({ message: 'Not Found' }, 404);
      g.content = JSON.parse(init!.body as string).files[SAVE_FILE].content;
      g.updated = ++clock;
      net.writes++;
      return json({ id: m[1] });
    }
    return json({ message: 'Not Found' }, 404);
  };
  const saved = (): State => JSON.parse([...gists.values()][0].content).state;
  return { fetchFn, gists, net, saved };
}

/** Устройство: своё хранилище, свои часы, свой Sync, общий GitHub. */
function device(gh: ReturnType<typeof fakeGitHub>, name: string, now: { t: number }) {
  let raw: string | null = null;
  let prefs: string | null = null;
  const storage: Storage = { load: () => raw, save: (j) => (raw = j) };
  const p: Prefs = { load: () => prefs, save: (j) => (prefs = j) };
  const store = new Store(storage, () => now.t);
  const sync = new Sync(store, p, gh.fetchFn, name);
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

  it('неверный токен не подключается и объясняет почему', async () => {
    const gh = fakeGitHub();
    const pc = device(gh, 'компьютер', { t: at(9) });
    await expect(pc.sync.connect('bad')).rejects.toThrow('GitHub не принял токен');
    expect(pc.sync.connected).toBe(false);
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
