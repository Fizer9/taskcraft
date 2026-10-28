// Летопись: герой, последние дни, настройки, копия сохранения и авторы.
import { useRef } from 'preact/hooks';
import { heroLevel } from '../game/rules';
import { doneOn } from '../game/state';
import { parseSave } from '../game/store';
import { addDays, formatDate, formatDuration, formatMinutes } from '../game/time';
import type { Settings } from '../game/types';
import { W } from '../game/words';
import type { Ui } from './App';
import { GIcon } from './Icon';
import { SyncPanel } from './SyncPanel';

const WEEK = [1, 2, 3, 4, 5, 6, 0];
const WEEK_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function Chronicle({ ui }: { ui: Ui }) {
  const { store } = ui;
  const s = store.state;
  const lvl = heroLevel(s.hero.xp);
  const days = Array.from({ length: 14 }, (_, i) => addDays(s.day, -i)).filter((d) => s.log[d]);
  const file = useRef<HTMLInputElement>(null);

  const setSetting = (patch: Partial<Settings>) => store.act((st) => Object.assign(st.settings, patch));

  const download = () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lager-${s.day}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const upload = async (f: File) => {
    const next = parseSave(await f.text());
    if (!next) {
      ui.toast('Это не копия Лагеря');
      return;
    }
    if (!confirm('Заменить текущую игру копией из файла?')) return;
    ui.sync.replaceGame(next);
    ui.toast('Копия загружена');
  };

  return (
    <div class="page">
      <h1 class="page-title">{W.chronicle}</h1>

      <div class="hero-card">
        <div class="hero-level">
          <span class="hero-level-n">{lvl.level}</span>
          <span class="hero-level-l">уровень</span>
        </div>
        <div class="hero-body">
          <div class="hero-xp">
            {lvl.into} / {lvl.need} опыта до следующего
          </div>
          <span class="bar bar-gold" aria-hidden="true">
            <span style={{ width: `${(lvl.into / lvl.need) * 100}%` }} />
          </span>
          <div class="hero-gold">
            <GIcon name="coins" size={15} />
            {s.hero.gold.toLocaleString('ru-RU')} золота в сундуке
          </div>
        </div>
      </div>

      <section class="group">
        <div class="group-head">
          <span class="sc">Последние дни</span>
        </div>
        {days.length === 0 && <p class="note">Летопись пуста. Первая запись появится после первой сделанной задачи.</p>}
        {days.map((d) => {
          const l = s.log[d];
          const done = doneOn(s, d);
          return (
            <details key={d} class="day">
              <summary>
                <span class="day-date">{formatDate(d)}</span>
                <span class="meta">
                  {l.done} сделано · +{l.gold} · {formatDuration(Math.round(l.workedMs / 60_000))}
                </span>
                {l.frog && <GIcon name="frog" size={15} class="ic-green" />}
              </summary>
              {done.map((t) => (
                <div key={t.id} class="day-task">
                  <GIcon name="check" size={12} class="ic-green" />
                  {t.title}
                </div>
              ))}
            </details>
          );
        })}
      </section>

      <section class="group">
        <div class="group-head">
          <span class="sc">Распорядок</span>
        </div>
        <div class="field-row">
          <TimeField label="Работа с" value={s.settings.workStart} onChange={(v) => setSetting({ workStart: v })} />
          <TimeField label="до" value={s.settings.workEnd} onChange={(v) => setSetting({ workEnd: v })} />
          <TimeField label="Отбой" value={s.settings.bedtime} onChange={(v) => setSetting({ bedtime: v })} />
        </div>
        <div class="field">
          <div class="field-label">Рабочие дни</div>
          <div class="chips">
            {WEEK.map((d) => {
              const on = s.settings.workDays.includes(d);
              return (
                <button
                  key={d}
                  class={`chipbtn${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => setSetting({ workDays: on ? s.settings.workDays.filter((x) => x !== d) : [...s.settings.workDays, d] })}
                >
                  {WEEK_SHORT[d]}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section class="group">
        <div class="group-head">
          <span class="sc">Сохранение в GitHub</span>
        </div>
        <SyncPanel ui={ui} />
      </section>

      <section class="group">
        <div class="group-head">
          <span class="sc">Копия в файл</span>
        </div>
        <p class="note">Игра хранится в этом браузере. Копия в файле пригодится, чтобы перенести игру без GitHub или просто не потерять.</p>
        <div class="btns">
          <button class="btn btn-ghost" onClick={download}>
            Сохранить копию
          </button>
          <button class="btn btn-ghost" onClick={() => file.current?.click()}>
            Загрузить копию
          </button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void upload(f);
          e.currentTarget.value = '';
        }} />
      </section>

      <section class="group credits">
        <div class="group-head">
          <span class="sc">Авторы</span>
        </div>
        <p class="note">
          Модели лагеря: KayKit (Kay Lousberg), лицензия CC0. Иконки: game-icons.net (Lorc, Delapouite и другие), лицензия CC BY 3.0. Шрифты Alegreya и Alegreya Sans
          (Juan Pablo del Peral, Huerta Tipográfica), лицензия SIL OFL.
        </p>
      </section>
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const str = formatMinutes(value).padStart(5, '0');
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      <input
        class="input"
        type="time"
        value={str}
        onChange={(e) => {
          const [h, m] = e.currentTarget.value.split(':').map(Number);
          if (!Number.isNaN(h) && !Number.isNaN(m)) onChange(h * 60 + m);
        }}
      />
    </label>
  );
}
