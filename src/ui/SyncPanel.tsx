// Сохранение в GitHub: подключение по токену, состояние и выбор, когда в GitHub другая игра.
import { useEffect, useState } from 'preact/hooks';
import { heroLevel } from '../game/rules';
import { dayKey, formatClock, formatDate, plural } from '../game/time';
import type { State } from '../game/types';
import { GitHubError, TOKEN_URL } from '../sync/github';
import type { Sync } from '../sync/sync';
import type { Ui } from './App';
import { Sheet } from './Sheets';

/** Перерисовать компонент, когда меняется состояние сохранения. */
export function useSync(sync: Sync): void {
  const [, setN] = useState(0);
  useEffect(() => sync.subscribe(() => setN((n) => n + 1)), [sync]);
}

function when(ts: number, now: number): string {
  return dayKey(ts) === dayKey(now) ? `сегодня в ${formatClock(ts)}` : `${formatDate(dayKey(ts))}, в ${formatClock(ts)}`;
}

const FROM_DEVICE: Record<string, string> = { телефон: 'с телефона', компьютер: 'с компьютера' };

export function SyncPanel({ ui }: { ui: Ui }) {
  const { sync } = ui;
  useSync(sync);
  const st = sync.status;
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!sync.connected) {
    const connect = async (e: Event) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        await sync.connect(token);
        setToken('');
        // Если в GitHub другая игра, сейчас откроется выбор, и сообщение его только заслонит.
        if (sync.status.phase !== 'conflict') ui.toast('GitHub подключён');
      } catch (err) {
        setError(err instanceof GitHubError ? err.message : 'Не получилось подключиться');
      } finally {
        setBusy(false);
      }
    };
    return (
      <div class="sync">
        <p class="note">
          Игра сохраняется в секретный гист на твоём GitHub, и телефон с компьютером видят одну и ту же игру. Нужен токен, которому разрешены только гисты.
        </p>
        <ol class="steps">
          <li>
            <a href={TOKEN_URL} target="_blank" rel="noopener noreferrer">
              Создай токен на GitHub
            </a>
            . Название, срок на год и право «Gists: Read and write» уже выбраны, внизу страницы нажми «Generate token».
          </li>
          <li>Скопируй токен (он начинается с github_pat_) и вставь сюда.</li>
          <li>На втором устройстве вставь тот же токен: сохранение найдётся само.</li>
        </ol>
        <form class="sync-form" onSubmit={connect}>
          <input
            class="input"
            type="password"
            autocomplete="off"
            spellcheck={false}
            placeholder="github_pat_…"
            aria-label="Токен GitHub"
            value={token}
            onInput={(e) => setToken(e.currentTarget.value)}
          />
          <button class="btn btn-gold" type="submit" disabled={busy || !token.trim()}>
            {busy ? 'Подключаю…' : 'Подключить'}
          </button>
        </form>
        {error && <p class="note note-error">{error}</p>}
      </div>
    );
  }

  const now = ui.now;
  let line: string;
  switch (st.phase) {
    case 'syncing':
      line = 'Сохраняю…';
      break;
    case 'offline':
      line = 'Нет связи. Игра сохраняется здесь и уйдёт в GitHub, когда появится сеть.';
      break;
    case 'error':
      line = 'Не сохраняется';
      break;
    case 'conflict':
      line = 'В GitHub другая игра, нужно выбрать';
      break;
    default:
      line = st.syncedAt ? `Сохранено ${when(st.syncedAt, now).replace('сегодня ', '')}` : 'Подключено';
  }

  return (
    <div class="sync">
      <div class="sync-state">
        <span class={`sync-dot sync-${st.phase}`} aria-hidden="true" />
        <span class="sync-who">GitHub · {st.login}</span>
        <span class="meta">{line}</span>
      </div>
      {st.phase === 'error' && st.error && <p class="note note-error">{st.error}</p>}
      <div class="btns">
        {st.phase === 'conflict' ? (
          <button class="btn btn-gold" onClick={() => ui.open({ kind: 'syncConflict' })}>
            Выбрать игру
          </button>
        ) : (
          <button class="btn btn-ghost" disabled={st.phase === 'syncing'} onClick={() => void sync.syncNow()}>
            Сохранить сейчас
          </button>
        )}
        <button
          class="btn btn-ghost"
          onClick={() => {
            if (confirm('Отключить GitHub на этом устройстве? Сохранение на GitHub останется.')) sync.disconnect();
          }}
        >
          Отключить
        </button>
      </div>
      <p class="note">Токен хранится только в этом браузере и в копию сохранения не попадает.</p>
    </div>
  );
}

function summary(s: State): string {
  const open = s.tasks.filter((t) => t.status === 'open' || t.status === 'inbox').length;
  const lvl = heroLevel(s.hero.xp).level;
  return `${lvl} уровень, ${s.hero.gold.toLocaleString('ru-RU')} золота, ${open} ${plural(open, 'задача', 'задачи', 'задач')} в отряде`;
}

export function SyncConflictSheet({ ui }: { ui: Ui }) {
  const { sync } = ui;
  useSync(sync);
  const c = sync.status.conflict;
  useEffect(() => {
    if (!c) ui.close();
  }, [c]);
  if (!c) return null;
  const pick = async (choice: 'remote' | 'local' | 'cancel') => {
    ui.close();
    await sync.resolve(choice);
    if (choice === 'remote') ui.toast('Игра из GitHub загружена');
    if (choice === 'local') ui.toast('Эта игра записана в GitHub');
  };
  return (
    <Sheet
      title="В GitHub другая игра"
      onClose={ui.close}
      footer={
        <div class="btns btns-col">
          <button class="btn btn-gold" onClick={() => void pick('remote')}>
            Взять игру из GitHub
          </button>
          <button class="btn btn-ghost" onClick={() => void pick('local')}>
            Записать в GitHub эту
          </button>
          <button class="link-btn" onClick={() => void pick('cancel')}>
            Не подключать GitHub
          </button>
        </div>
      }
    >
      <p class="note">
        В GitHub лежит другая игра, её сохранили {FROM_DEVICE[c.device] ?? c.device} {when(c.savedAt, ui.now)}. Оставить можно одну: вторая заменится.
      </p>
      <div class="compare">
        <div class="compare-row">
          <span class="sc">В GitHub</span>
          <span>{summary(c.remote)}</span>
        </div>
        <div class="compare-row">
          <span class="sc">Здесь</span>
          <span>{summary(ui.store.state)}</span>
        </div>
      </div>
      <p class="note">Если сомневаешься, сначала сохрани копию этой игры в файл.</p>
    </Sheet>
  );
}
