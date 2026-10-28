// Правила игры как функции над State. Функции меняют переданное состояние на месте,
// поэтому store вызывает их на своей копии. DOM здесь нет, всё проверяется тестами.
import {
  FORGOTTEN_AFTER,
  FROG_XP_MULT,
  GOLD_PER_LEVEL,
  HOUR,
  MANA_DRAIN_PER_HOUR,
  MANA_MAX,
  MANA_REST_PER_HOUR,
  PLAN_XP_PER_TASK,
  SECOND_WIND,
  SWITCH_COST,
  XP_BY_LEVEL,
  levelForEstimate,
} from './rules';
import { addDays, dayKey, daysBetween, shiftAt } from './time';
import type { DayKey, DayLog, Level, Quest, QuestColor, QuestKind, Reward, Settings, State, Task } from './types';

export const DEFAULT_SETTINGS: Settings = {
  workStart: 9 * 60,
  workEnd: 18 * 60,
  workDays: [1, 2, 3, 4, 5],
  bedtime: 23 * 60,
};

/** Случайная строка для id: два устройства не выдадут одинаковых, даже без связи. */
export function randomId(len = 8): string {
  const abc = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += abc[b % abc.length];
  return out;
}

export function newState(now: number): State {
  const s: State = {
    v: 1,
    gameId: randomId(12),
    createdAt: now,
    touchedAt: null,
    day: dayKey(now),
    hero: { xp: 0, gold: 0, mana: MANA_MAX },
    quests: [],
    tasks: [],
    current: null,
    breakSince: null,
    lastQuestId: null,
    frogId: null,
    litDay: null,
    closedDay: null,
    secondWindDay: null,
    settledAt: now,
    log: {},
    settings: { ...DEFAULT_SETTINGS, workDays: [...DEFAULT_SETTINGS.workDays] },
    seq: 0,
  };
  addQuest(s, now, { name: 'Работа', kind: 'work', color: 'blue' });
  addQuest(s, now, { name: 'Личное', kind: 'personal', color: 'green' });
  addQuest(s, now, { name: 'Дом и быт', kind: 'any', color: 'brown' });
  return s;
}

function nextId(s: State, prefix: string): string {
  s.seq += 1;
  return `${prefix}${s.seq.toString(36)}-${randomId(4)}`;
}

export function logOf(s: State, day: DayKey): DayLog {
  let l = s.log[day];
  if (!l) {
    l = { gold: 0, xp: 0, done: 0, workedMs: 0, restMs: 0, frog: false, undeadSlain: 0 };
    s.log[day] = l;
  }
  return l;
}

export function findTask(s: State, id: string): Task | undefined {
  return s.tasks.find((t) => t.id === id);
}

export function findQuest(s: State, id: string | null): Quest | undefined {
  return id ? s.quests.find((q) => q.id === id) : undefined;
}

function clampMana(m: number): number {
  return Math.max(0, Math.min(MANA_MAX, m));
}

// ---------- время ----------

/** Начисляет время и ману с прошлого раза до now и переводит день, если он сменился. */
export function settle(s: State, now: number): void {
  const from = s.settledAt;
  if (now > from) {
    const cur = s.current;
    if (cur && cur.runningSince !== null) {
      const stopAt = cur.seenAt + FORGOTTEN_AFTER;
      const until = Math.min(now, stopAt);
      const start = Math.max(from, cur.runningSince);
      if (until > start) accrueWork(s, cur.taskId, until - start, start);
      if (now >= stopAt) {
        cur.runningSince = null;
        cur.idleSince = stopAt;
      }
    } else if (s.breakSince !== null) {
      const start = Math.max(from, s.breakSince);
      const dt = now - start;
      s.hero.mana = clampMana(s.hero.mana + (MANA_REST_PER_HOUR * dt) / HOUR);
      logOf(s, dayKey(start)).restMs += dt;
    }
    s.settledAt = now;
  }
  const today = dayKey(now);
  if (today !== s.day) rollover(s, today);
}

function accrueWork(s: State, taskId: string, dt: number, at: number): void {
  const t = findTask(s, taskId);
  if (t) t.spentMs += dt;
  s.hero.mana = clampMana(s.hero.mana - (MANA_DRAIN_PER_HOUR * dt) / HOUR);
  logOf(s, dayKey(at)).workedMs += dt;
}

/** Новый день: силы полны, план заново. Незакрытый вчера день переносит задачи сам. */
function rollover(s: State, today: DayKey): void {
  for (const t of s.tasks) {
    if (t.status === 'open' && t.day !== null && t.day < today) t.day = today;
  }
  s.day = today;
  s.hero.mana = MANA_MAX;
  s.frogId = null;
  s.litDay = null;
  s.closedDay = null;
  s.breakSince = null;
  s.lastQuestId = null;
  if (s.current) {
    s.current.runningSince = null;
    s.current.idleSince = null;
  }
}

/** Игрок заглянул в приложение: защита от забытого таймера отодвигается. */
export function touch(s: State, now: number): void {
  if (s.current && s.current.runningSince !== null) s.current.seenAt = now;
}

// ---------- походы ----------

export function addQuest(
  s: State,
  now: number,
  q: { name: string; kind: QuestKind; color: QuestColor },
): string {
  const id = nextId(s, 'q');
  s.quests.push({ id, name: q.name.trim() || 'Без названия', kind: q.kind, color: q.color, createdAt: now });
  return id;
}

export function updateQuest(s: State, id: string, patch: Partial<Pick<Quest, 'name' | 'kind' | 'color'>>): void {
  const q = findQuest(s, id);
  if (q) Object.assign(q, patch);
}

/** Логово: сумма уровней всех задач похода, урон равен уровням сделанных. */
export function lairOf(s: State, questId: string): { hp: number; max: number } {
  let hp = 0;
  let max = 0;
  for (const t of s.tasks) {
    if (t.questId !== questId || t.status === 'released' || t.status === 'inbox') continue;
    max += t.level;
    if (t.status === 'open') hp += t.level;
  }
  return { hp, max };
}

/** Поход выигран: логово пало, поход уходит в зал трофеев. Открытых задач быть не должно. */
export function winQuest(s: State, now: number, id: string): boolean {
  const q = findQuest(s, id);
  if (!q || q.wonAt) return false;
  if (lairOf(s, id).hp > 0) return false;
  q.wonAt = now;
  return true;
}

/** Убрать поход: его задачи возвращаются письмами к вестнику. */
export function removeQuest(s: State, id: string): void {
  s.quests = s.quests.filter((q) => q.id !== id);
  for (const t of s.tasks) {
    if (t.questId === id) {
      t.questId = null;
      if (t.status === 'open') t.status = 'inbox';
    }
  }
}

// ---------- задачи ----------

export interface TaskInput {
  title: string;
  questId: string | null;
  level?: Level;
  estimateMin?: number | null;
  day?: DayKey | null;
  due?: DayKey | null;
  at?: string | null;
}

export function addTask(s: State, now: number, input: TaskInput): string {
  const id = nextId(s, 't');
  const estimateMin = input.estimateMin ?? null;
  const level = input.level ?? (estimateMin !== null ? levelForEstimate(estimateMin) : 1);
  const day = input.day ?? null;
  const t: Task = {
    id,
    title: input.title.trim() || 'Без названия',
    questId: input.questId,
    level,
    estimateMin,
    status: input.questId || day ? 'open' : 'inbox',
    day,
    order: day ? nextOrder(s, day) : 0,
    due: input.due ?? null,
    at: input.at ?? null,
    spentMs: 0,
    createdAt: now,
  };
  s.tasks.push(t);
  return id;
}

export function updateTask(s: State, id: string, patch: Partial<Omit<Task, 'id' | 'status' | 'spentMs'>>): void {
  const t = findTask(s, id);
  if (!t) return;
  if (patch.day !== undefined && patch.day !== t.day && patch.day !== null) {
    t.order = nextOrder(s, patch.day);
  }
  Object.assign(t, patch);
  if (t.status === 'inbox' && t.questId) t.status = 'open';
}

function nextOrder(s: State, day: DayKey): number {
  let max = 0;
  for (const t of s.tasks) if (t.day === day && t.order > max) max = t.order;
  return max + 1;
}

/** Позвать в план на день (по умолчанию сегодня) или убрать из плана. */
export function planTask(s: State, id: string, day: DayKey | null): void {
  const t = findTask(s, id);
  if (!t || t.status === 'done' || t.status === 'released') return;
  if (day === null) {
    t.day = null;
    if (s.current?.taskId === id) s.current = null;
    if (s.frogId === id) s.frogId = null;
    return;
  }
  if (t.day !== day) {
    t.day = day;
    t.order = nextOrder(s, day);
  }
  if (t.status === 'inbox') t.status = 'open';
}

export function moveInPlan(s: State, id: string, dir: -1 | 1): void {
  const t = findTask(s, id);
  if (!t || !t.day) return;
  const list = s.tasks.filter((x) => x.day === t.day && x.status !== 'released').sort((a, b) => a.order - b.order);
  const i = list.indexOf(t);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  const o = list[j].order;
  list[j].order = t.order;
  t.order = o;
}

/** Позвать к огню: таймер задачи пошёл. Задача из другого похода стоит маны. */
export function start(s: State, now: number, id: string): { switchCost: number } {
  settle(s, now);
  const t = findTask(s, id);
  if (!t || t.status === 'done' || t.status === 'released') return { switchCost: 0 };
  if (t.status === 'inbox') t.status = 'open';
  if (t.day !== s.day) planTask(s, id, s.day);
  s.breakSince = null;
  let switchCost = 0;
  if (s.lastQuestId !== null && t.questId !== s.lastQuestId) {
    switchCost = SWITCH_COST;
    s.hero.mana = clampMana(s.hero.mana - SWITCH_COST);
  }
  s.lastQuestId = t.questId;
  s.current = { taskId: id, runningSince: now, seenAt: now, idleSince: null };
  return { switchCost };
}

/** Таймер стоит, задача остаётся у огня. */
export function pause(s: State, now: number): void {
  settle(s, now);
  if (s.current) s.current.runningSince = null;
}

export function resume(s: State, now: number): void {
  settle(s, now);
  if (!s.current) return;
  s.breakSince = null;
  s.current.runningSince = now;
  s.current.seenAt = now;
  s.current.idleSince = null;
}

/** Привал: отряд садится к огню, таймер стоит, мана растёт. Повторный вызов снимает лагерь. */
export function toggleBreak(s: State, now: number): void {
  settle(s, now);
  if (s.breakSince !== null) {
    s.breakSince = null;
    if (s.current) {
      s.current.runningSince = now;
      s.current.seenAt = now;
      s.current.idleSince = null;
    }
    return;
  }
  if (s.current) s.current.runningSince = null;
  s.breakSince = now;
}

/** Таймер встал сам, игрок говорит, что всё это время работал. */
export function confirmWorking(s: State, now: number): void {
  settle(s, now);
  const cur = s.current;
  if (!cur || cur.idleSince === null) return;
  accrueWork(s, cur.taskId, now - cur.idleSince, cur.idleSince);
  cur.idleSince = null;
  cur.runningSince = now;
  cur.seenAt = now;
}

/** Таймер встал сам, игрок не работал: оставляем как есть. */
export function dismissIdle(s: State): void {
  if (s.current) s.current.idleSince = null;
}

export function rewardFor(s: State, t: Task, level: Level): Reward {
  const frog = s.frogId === t.id;
  const xp = XP_BY_LEVEL[level] * (frog ? FROG_XP_MULT : 1);
  return { gold: GOLD_PER_LEVEL * level, xp, frog, damage: level };
}

export interface CompleteResult {
  reward: Reward;
  lair: { before: number; after: number; max: number } | null;
  undead: boolean;
}

/** Готово: золото в сундук, опыт герою, урон логову. Уровень можно поправить тут же. */
export function complete(s: State, now: number, id: string, level?: Level): CompleteResult | null {
  settle(s, now);
  const t = findTask(s, id);
  if (!t || t.status === 'done' || t.status === 'released') return null;
  if (level) t.level = level;
  if (t.status === 'inbox') t.status = 'open';
  const lairBefore = t.questId ? lairOf(s, t.questId) : null;
  const undead = isUndead(t, s.day);
  const reward = rewardFor(s, t, t.level);
  t.status = 'done';
  t.doneAt = now;
  t.doneDay = s.day;
  t.reward = reward;
  if (!t.day) t.day = s.day;
  s.hero.gold += reward.gold;
  s.hero.xp += reward.xp;
  const l = logOf(s, s.day);
  l.gold += reward.gold;
  l.xp += reward.xp;
  l.done += 1;
  if (reward.frog) l.frog = true;
  if (undead) l.undeadSlain += 1;
  if (s.current?.taskId === id) s.current = null;
  const lairAfter = t.questId ? lairOf(s, t.questId) : null;
  return {
    reward,
    lair: lairBefore && lairAfter ? { before: lairBefore.hp, after: lairAfter.hp, max: lairAfter.max } : null,
    undead,
  };
}

/** Отпустить: задача уходит без награды и без штрафа. */
export function release(s: State, now: number, id: string): void {
  settle(s, now);
  const t = findTask(s, id);
  if (!t) return;
  t.status = 'released';
  if (s.current?.taskId === id) s.current = null;
  if (s.frogId === id) s.frogId = null;
}

/** Вернуть сделанную задачу назад (если нажал «Готово» по ошибке). */
export function undoComplete(s: State, id: string): void {
  const t = findTask(s, id);
  if (!t || t.status !== 'done' || !t.reward || !t.doneDay) return;
  s.hero.gold -= t.reward.gold;
  s.hero.xp -= t.reward.xp;
  const l = logOf(s, t.doneDay);
  l.gold -= t.reward.gold;
  l.xp -= t.reward.xp;
  l.done -= 1;
  t.status = 'open';
  delete t.doneAt;
  delete t.doneDay;
  delete t.reward;
}

export function setFrog(s: State, id: string | null): void {
  s.frogId = id;
}

/** Разжечь костёр: план дня утверждён, за него даётся немного опыта. */
export function lightFire(s: State, now: number): number {
  settle(s, now);
  if (s.litDay === s.day) return 0;
  const n = s.tasks.filter((t) => t.day === s.day && t.status === 'open').length;
  const xp = n * PLAN_XP_PER_TASK;
  s.hero.xp += xp;
  logOf(s, s.day).xp += xp;
  s.litDay = s.day;
  return xp;
}

export function canSecondWind(s: State, now: number): boolean {
  if (s.secondWindDay === s.day) return false;
  const shift = shiftAt(now, s.settings);
  if (shift !== 'evening' && shift !== 'weekend') return false;
  return (s.log[s.day]?.workedMs ?? 0) > 0;
}

export function secondWind(s: State, now: number): boolean {
  settle(s, now);
  if (!canSecondWind(s, now)) return false;
  s.hero.mana = clampMana(s.hero.mana + SECOND_WIND);
  s.secondWindDay = s.day;
  return true;
}

/** Отбой: отмеченные задачи остаются у огня на завтра, остальные возвращаются в отряд. */
export function endDay(s: State, now: number, keepIds: string[]): void {
  settle(s, now);
  const keep = new Set(keepIds);
  const tomorrow = addDays(s.day, 1);
  for (const t of s.tasks) {
    if (t.status !== 'open' || t.day !== s.day) continue;
    if (keep.has(t.id)) {
      t.day = tomorrow;
      t.order = nextOrder(s, tomorrow);
    } else {
      t.day = null;
    }
  }
  s.current = null;
  s.breakSince = null;
  s.closedDay = s.day;
}

export function reopenDay(s: State): void {
  s.closedDay = null;
}

// ---------- выборки ----------

export function isUndead(t: Task, today: DayKey): boolean {
  return t.status === 'open' && t.due !== null && t.due < today;
}

export function daysOverdue(t: Task, today: DayKey): number {
  return t.due ? daysBetween(t.due, today) : 0;
}

/** Нежить на дороге: старшая (самая давняя просрочка) первой. */
export function undeadOf(s: State): Task[] {
  return s.tasks
    .filter((t) => isUndead(t, s.day))
    .sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : a.createdAt - b.createdAt));
}

export function inboxOf(s: State): Task[] {
  return s.tasks.filter((t) => t.status === 'inbox').sort((a, b) => a.createdAt - b.createdAt);
}

export function planOf(s: State, day: DayKey = s.day): Task[] {
  return s.tasks
    .filter((t) => t.day === day && (t.status === 'open' || (t.status === 'done' && t.doneDay === day)))
    .sort((a, b) => a.order - b.order);
}

/** Задачи в отряде, но не на сегодня: из них собирают план. */
export function backlogOf(s: State): Task[] {
  return s.tasks
    .filter((t) => t.status === 'open' && t.day !== s.day)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt - b.createdAt);
}

export function doneOn(s: State, day: DayKey): Task[] {
  return s.tasks.filter((t) => t.status === 'done' && t.doneDay === day).sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0));
}

/** Время задачи вместе с идущим сейчас отрезком. */
export function spentNow(s: State, t: Task, now: number): number {
  const cur = s.current;
  if (cur && cur.taskId === t.id && cur.runningSince !== null) {
    const stopAt = cur.seenAt + FORGOTTEN_AFTER;
    return t.spentMs + Math.max(0, Math.min(now, stopAt) - Math.max(s.settledAt, cur.runningSince));
  }
  return t.spentMs;
}
