// Хранилище: держит State, сохраняет его в localStorage и оповещает экраны.
import { newState, randomId, settle, touch } from './state';
import type { State } from './types';

const KEY = 'taskcraft-lager-v1';
const SAVE_EVERY_MS = 15_000;

type Listener = () => void;

export interface Storage {
  load(): string | null;
  save(json: string): void;
}

export const browserStorage: Storage = {
  load() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  save(json) {
    try {
      localStorage.setItem(KEY, json);
    } catch {
      // Хранилище недоступно (приватный режим): игра идёт без сохранения.
    }
  },
};

export function parseSave(json: string): State | null {
  try {
    return checkSave(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Проверяет, что это сохранение Лагеря, и дописывает поля, которых не было в ранних версиях. */
export function checkSave(raw: unknown): State | null {
  const s = raw as State | null;
  if (!s || typeof s !== 'object' || s.v !== 1 || !Array.isArray(s.tasks) || !Array.isArray(s.quests)) return null;
  s.gameId ??= randomId(12);
  s.touchedAt ??= null;
  return s;
}

export class Store {
  state: State;
  private listeners = new Set<Listener>();
  private actionListeners = new Set<Listener>();
  private lastSave = 0;

  constructor(
    private storage: Storage = browserStorage,
    private clock: () => number = Date.now,
  ) {
    const raw = storage.load();
    const now = clock();
    this.state = (raw && parseSave(raw)) || newState(now);
    settle(this.state, now);
    this.persist();
  }

  now(): number {
    return this.clock();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Только действия игрока, без тиков времени: по ним сохранение в GitHub знает, что писать. */
  onAction(fn: Listener): () => void {
    this.actionListeners.add(fn);
    return () => this.actionListeners.delete(fn);
  }

  /** Любое действие игрока: начисляем время, применяем правило, сохраняем. */
  act<R>(fn: (s: State, now: number) => R): R {
    const now = this.clock();
    settle(this.state, now);
    touch(this.state, now);
    this.state.touchedAt = now;
    const r = fn(this.state, now);
    this.persist();
    for (const l of this.actionListeners) l();
    this.emit();
    return r;
  }

  /** Раз в секунду: только время, без касания игрока. */
  tick(): void {
    const now = this.clock();
    const day = this.state.day;
    settle(this.state, now);
    if (now - this.lastSave >= SAVE_EVERY_MS || day !== this.state.day) this.persist();
    this.emit();
  }

  /** Игрок вернулся в приложение: таймер знает, что его видели, но это ещё не действие. */
  wake(): void {
    const now = this.clock();
    settle(this.state, now);
    touch(this.state, now);
    this.persist();
    this.emit();
  }

  replace(next: State): void {
    this.state = next;
    settle(this.state, this.clock());
    this.persist();
    this.emit();
  }

  exportJson(): string {
    return JSON.stringify(this.state, null, 1);
  }

  persist(): void {
    this.lastSave = this.clock();
    this.storage.save(JSON.stringify(this.state));
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
