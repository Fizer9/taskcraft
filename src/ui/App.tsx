import { useEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../game/store';
import type { Sync } from '../sync/sync';
import type { CompleteResult } from '../game/state';
import { W } from '../game/words';
import { Camp } from './Camp';
import { Chronicle } from './Chronicle';
import { useStore } from './hooks';
import { GIcon, LIcon } from './Icon';
import { Plan } from './Plan';
import { Realm } from './Realm';
import { Sheets, type SheetState } from './Sheets';
import { useSync } from './SyncPanel';

export type Screen = 'camp' | 'plan' | 'realm' | 'chronicle';

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
  toast(text: string): void;
  cheer: Cheer | null;
  setCheer(c: Cheer | null): void;
}

const CHEER_MS = 12_000;

export function App({ store, sync }: { store: Store; sync: Sync }) {
  useStore(store);
  useSync(sync);
  const s = store.state;
  const [screen, setScreen] = useState<Screen>(() => (s.litDay !== s.day && s.closedDay !== s.day ? 'plan' : 'camp'));
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [cheer, setCheerState] = useState<Cheer | null>(null);
  const [day, setDay] = useState(s.day);

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
      setToast({ text: `GitHub: ${syncError}`, id: Date.now() });
    }
  }, [phase, syncError]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
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
    open: setSheet,
    close: () => setSheet(null),
    toast: (text) => setToast({ text, id: Date.now() }),
    cheer: liveCheer,
    setCheer: (c) => setCheerState(c ? { ...c, until: store.now() + CHEER_MS } : null),
  };

  return (
    <div class="app">
      <main class="screen">
        {screen === 'camp' && <Camp ui={ui} />}
        {screen === 'plan' && <Plan ui={ui} />}
        {screen === 'realm' && <Realm ui={ui} />}
        {screen === 'chronicle' && <Chronicle ui={ui} />}
      </main>
      <nav class="tabbar" aria-label="Разделы">
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
      {toast && (
        <div class="toast" role="status" key={toast.id}>
          {toast.text}
        </div>
      )}
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
