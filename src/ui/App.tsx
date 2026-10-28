import { useEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../game/store';
import type { Sync } from '../sync/sync';
import type { CompleteResult } from '../game/state';
import { W } from '../game/words';
import { Camp } from './Camp';
import { Chronicle } from './Chronicle';
import { isLost, restoreFocus, spotOf, type FocusSpot } from './focus';
import { useStore } from './hooks';
import { Intro } from './Intro';
import { loadLocal, updateLocal } from './local';
import { GIcon, LIcon } from './Icon';
import { Notices } from './Notices';
import { Plan } from './Plan';
import { Realm } from './Realm';
import { Sheets, type SheetState } from './Sheets';
import { useSync } from './SyncPanel';

export type Screen = 'camp' | 'plan' | 'realm' | 'chronicle';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Cheer {
  taskId: string;
  result: CompleteResult;
  until: number;
}

/** То, чем экраны управляют приложением. */
export interface Ui {
  store: Store;
  sync: Sync;
  now: number;
  go(screen: Screen): void;
  open(sheet: SheetState): void;
  close(): void;
  /** Короткое сообщение внизу; с действием живёт дольше, чтобы успеть нажать. */
  toast(text: string, action?: ToastAction): void;
  cheer: Cheer | null;
  setCheer(c: Cheer | null): void;
  showIntro(): void;
}

/** Знакомство показываем новичку. Тому, у кого уже есть задачи (обновился или взял игру из GitHub), не показываем. */
function needIntro(store: Store): boolean {
  const now = store.now();
  if (loadLocal(now).introDone) return false;
  if (store.state.tasks.length === 0) return true;
  updateLocal(now, (l) => {
    l.introDone = true;
  });
  return false;
}

const CHEER_MS = 12_000;

export function App({ store, sync }: { store: Store; sync: Sync }) {
  useStore(store);
  useSync(sync);
  const s = store.state;
  const [screen, setScreen] = useState<Screen>(() => (s.litDay !== s.day && s.closedDay !== s.day ? 'plan' : 'camp'));
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number; action?: ToastAction } | null>(null);
  const [cheer, setCheerState] = useState<Cheer | null>(null);
  /** Откуда открыли лист: туда вернётся фокус, когда листов не останется. */
  const opener = useRef<FocusSpot | null>(null);
  /** Где фокус стоял последним: если кнопка пропадёт после действия, он вернётся рядом. */
  const lastFocus = useRef<FocusSpot | null>(null);
  const [day, setDay] = useState(s.day);
  const [intro, setIntro] = useState(() => needIntro(store));

  useEffect(() => {
    const id = window.setInterval(() => store.tick(), 1000);
    const onVis = () => {
      if (document.visibilityState === 'visible') store.wake();
      else store.persist();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', () => store.persist());
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [store]);

  // Новый день открывается сбором отряда.
  useEffect(() => {
    if (s.day !== day) {
      setDay(s.day);
      setScreen('plan');
      setSheet(null);
    }
  }, [s.day, day]);

  // В GitHub другая игра: сразу спрашиваем, какую оставить.
  const phase = sync.status.phase;
  useEffect(() => {
    if (phase === 'conflict') setSheet({ kind: 'syncConflict' });
  }, [phase]);

  // Ошибку GitHub показываем один раз, а не при каждой новой попытке; пропавшая сеть не ошибка,
  // о ней сказано в Летописи.
  const shownError = useRef<string | null>(null);
  const syncError = sync.status.error;
  useEffect(() => {
    if (phase === 'ok') shownError.current = null;
    if (phase === 'error' && syncError && syncError !== shownError.current) {
      shownError.current = syncError;
      setToast({ text: syncError, id: Date.now() });
    }
  }, [phase, syncError]);

  useEffect(() => {
    if (sheet || !opener.current) return;
    const spot = opener.current;
    opener.current = null;
    restoreFocus(spot);
  }, [sheet]);

  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      lastFocus.current = spotOf(e.target as Element);
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);

  // После каждого обновления: фокус пропал вместе с кнопкой, а не потому что человек сам ушёл с неё.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const spot = lastFocus.current;
      if (!spot || (document.activeElement && document.activeElement !== document.body) || !isLost(spot)) return;
      lastFocus.current = null;
      restoreFocus(spot);
    });
    return () => cancelAnimationFrame(id);
  });

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), toast.action ? 6000 : 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const now = store.now();
  const liveCheer = cheer && cheer.until > now ? cheer : null;

  const ui: Ui = {
    store,
    sync,
    now,
    go: (sc) => {
      setSheet(null);
      setScreen(sc);
    },
    open: (next) => {
      if (!sheet) opener.current = spotOf(document.activeElement);
      setSheet(next);
    },
    close: () => setSheet(null),
    toast: (text, action) => setToast({ text, id: Date.now(), action }),
    cheer: liveCheer,
    setCheer: (c) => setCheerState(c ? { ...c, until: store.now() + CHEER_MS } : null),
    showIntro: () => {
      setSheet(null);
      setIntro(true);
    },
  };
  const closeIntro = () => {
    setIntro(false);
    updateLocal(store.now(), (l) => {
      l.introDone = true;
    });
  };

  // Пока открыт лист или знакомство, экран под ним недоступен ни пальцу, ни экранному чтецу, ни Tab.
  const covered = !!sheet || intro;
  return (
    <div class="app">
      <main class="screen" inert={covered}>
        {screen === 'camp' && <Camp ui={ui} />}
        {screen === 'plan' && <Plan ui={ui} />}
        {screen === 'realm' && <Realm ui={ui} />}
        {screen === 'chronicle' && <Chronicle ui={ui} />}
      </main>
      <Notices ui={ui} covered={covered} />
      <nav class="tabbar" aria-label="Разделы" inert={covered}>
        <TabButton icon="campfire" label={W.camp} active={screen === 'camp'} onClick={() => ui.go('camp')} />
        <TabButton icon="sunrise" label="План" active={screen === 'plan'} onClick={() => ui.go('plan')} />
        <button class="tab-add" aria-label="Добавить задачу" onClick={() => ui.open({ kind: 'add' })}>
          <span>
            <LIcon name="plus" size={22} stroke={2.6} />
          </span>
        </button>
        <TabButton icon="kingdom" label={W.realm} active={screen === 'realm'} onClick={() => ui.go('realm')} />
        <TabButton icon="scroll" label={W.chronicle} active={screen === 'chronicle'} onClick={() => ui.go('chronicle')} />
      </nav>
      {sheet && <Sheets ui={ui} sheet={sheet} />}
      {intro && <Intro onDone={closeIntro} />}
      {/* Живая область есть всегда: экранный диктор надёжнее читает текст, который появился в ней, чем новый блок.
          Вместе с сообщением он прочтёт и кнопку «Вернуть», если она есть. */}
      <div role="status">
        {toast && (
          <div class={`toast${toast.action ? ' toast-act' : ''}`} key={toast.id}>
            {toast.text}
            {toast.action && (
              <button
                class="toast-btn"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton(p: { icon: 'campfire' | 'sunrise' | 'kingdom' | 'scroll'; label: string; active: boolean; onClick: () => void }) {
  return (
    <button class={`tab${p.active ? ' is-active' : ''}`} aria-current={p.active ? 'page' : undefined} onClick={p.onClick}>
      <GIcon name={p.icon} size={24} />
      {p.label}
    </button>
  );
}
