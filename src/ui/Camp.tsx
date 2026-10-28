// Экран дня: сцена лагеря сверху, лист с текущей задачей и планом снизу. Всё на одном экране.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { HOUR, MANA_LOW, MANA_MAX, MANA_REST_PER_HOUR, estimateOf, heroLevel } from '../game/rules';
import {
  canSecondWind,
  complete,
  confirmWorking,
  dismissIdle,
  findQuest,
  reopenDay,
  resume,
  secondWind,
  spentNow,
  start,
  toggleBreak,
  undoComplete,
} from '../game/state';
import { formatClock, formatDate, formatDuration, formatTimer, formatTimerSeconds } from '../game/time';
import type { State, Task } from '../game/types';
import { campView, type CampView, type Tone } from '../game/view';
import { CLASS_AT, CLASS_BY_LEVEL, LEVEL_ROMAN, SHIFT_NAME, W } from '../game/words';
import { SCENE, SCENE_H, SCENE_W } from '../scene/scene';
import type { Ui } from './App';
import { useSize } from './hooks';
import { GIcon, LIcon } from './Icon';
import { TaskMeta } from './parts';
import { Scene } from './Scene';

export function Camp({ ui }: { ui: Ui }) {
  const { store, now } = ui;
  const s = store.state;
  const v = campView(s, now, ui.cheer?.taskId ?? null);
  const current = v.current;
  const spent = current ? spentNow(s, current, now) : 0;
  const timer = current ? formatTimer(spent) : null;

  const [rootRef, root] = useSize<HTMLDivElement>();
  const [wrapRef, wrap] = useSize<HTMLDivElement>();
  const sheetRef = useRef<HTMLElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [fixedH, setFixedH] = useState(0);

  useLayoutEffect(() => {
    const sh = sheetRef.current?.getBoundingClientRect().height ?? 0;
    const rh = rowsRef.current?.getBoundingClientRect().height ?? 0;
    const f = Math.round(sh - rh);
    if (Math.abs(f - fixedH) > 1) setFixedH(f);
  });

  const compact = root.h > 0 && root.h < 700;
  const rowH = compact ? 40 : 44;
  // Сцена не сжимается ниже того, что нужно, чтобы были видны все фигуры; на низком экране чуть срезается.
  const sceneNeed = (CONTENT.bottom - CONTENT.top) * (root.w / SCENE_W) + TOPBAR_H - SHEET_OVERLAP;
  const sceneMin = Math.max(170, Math.round(sceneNeed) - (compact ? 30 : 0));
  const fit = Math.max(1, Math.min(5, Math.floor((root.h - fixedH - sceneMin) / rowH)));
  // Задача из карточки «Дальше» в списке не повторяется.
  const nextInCard = !v.asleep && !ui.cheer && !v.onBreak && !current;
  const list = nextInCard ? v.main.slice(1) : v.main;
  const shown = list.length > fit ? list.slice(0, fit - 1) : list;
  const hidden = list.length - shown.length;

  return (
    <div class={`camp${compact ? ' is-compact' : ''}`} ref={rootRef}>
      <div class="scene-wrap" ref={wrapRef}>
        <div class="scene-box" style={sceneBox(wrap.w, wrap.h + SHEET_OVERLAP)}>
          <Scene
            view={v}
            timer={v.running || (current && !v.onBreak) ? timer : null}
            onTask={(id) => ui.open({ kind: 'task', taskId: id })}
            onLetters={() => ui.open({ kind: 'letters' })}
            onMore={() => ui.go('plan')}
          />
        </div>
        <TopBar s={s} v={v} now={now} />
      </div>

      <section class="sheet" ref={sheetRef} aria-label="Задачи дня">
        <div class="sheet-handle" aria-hidden="true" />
        {v.summaryDue && (
          <button class="banner" onClick={() => ui.open({ kind: 'summary' })}>
            <GIcon name="zzz" size={16} />
            Скоро отбой: подвести итоги дня
            <LIcon name="chevron" size={16} />
          </button>
        )}
        <MainCard ui={ui} v={v} timer={timer} seconds={current ? formatTimerSeconds(spent) : ''} />

        {!v.asleep && (list.length > 0 || v.doneToday > 0) && (
          <div class="list-head">
            <span class="sc">{W.moreToday}</span>
            {v.doneToday > 0 && (
              <span class="list-done">
                <GIcon name="check" size={13} />
                {v.doneToday} сделано
              </span>
            )}
          </div>
        )}
        <div ref={rowsRef}>
          {!v.asleep &&
            shown.map((t) => (
              <TaskRow key={t.id} s={s} t={t} n={v.numbers.get(t.id) ?? 0} tone={v.tones.get(t.id) ?? 'today'} onClick={() => ui.open({ kind: 'task', taskId: t.id })} />
            ))}
          {!v.asleep && hidden > 0 && (
            <button class="row row-more" onClick={() => ui.go('plan')}>
              <span class="row-title">Ещё {hidden} в плане дня</span>
              <LIcon name="chevron" size={16} />
            </button>
          )}
        </div>
        {!v.asleep && v.later.length > 0 && (
          <button class="row row-later" onClick={() => ui.go('plan')}>
            <span class="num-stack" aria-hidden="true">
              {v.later.slice(0, 2).map((t) => (
                <span key={t.id} class="num num-evening num-sm">
                  {v.numbers.get(t.id)}
                </span>
              ))}
            </span>
            <span class="row-title row-muted">
              {W.evening}: {v.later.map((t) => t.title.toLowerCase()).join(', ')}
            </span>
            <LIcon name="chevron" size={16} />
          </button>
        )}
      </section>
    </div>
  );
}

/** Лист заходит на сцену скруглённым краем. */
const SHEET_OVERLAP = 22;
/** Высота верхней полосы с датой, золотом и маной. */
const TOPBAR_H = 46;

/** Что на картинке должно быть видно: от номеров над нежитью на дороге до брёвен впереди. */
const CONTENT = (() => {
  let top = SCENE_H;
  for (const sp of Object.values(SCENE.sprites)) if (sp.head) top = Math.min(top, sp.head[1] - 34);
  const bottom = Math.max(...Object.values(SCENE.spots).map((p) => p[1])) + 12;
  return { top: Math.max(0, top), bottom: Math.min(SCENE_H, bottom) };
})();

/**
 * Картинка сцены покрывает место над листом. Если она выше этого места, лишнее срезается так,
 * чтобы нужная часть встала посередине между верхней полосой и листом.
 */
function sceneBox(w: number, visibleH: number): preact.JSX.CSSProperties {
  if (!w || !visibleH) return { width: '100%', aspectRatio: `${SCENE_W} / ${SCENE_H}` };
  const ratio = SCENE_H / SCENE_W;
  const scale = Math.max(1, visibleH / (w * ratio));
  const boxW = w * scale;
  const boxH = boxW * ratio;
  const k = boxH / SCENE_H;
  const want = (TOPBAR_H + visibleH - SHEET_OVERLAP) / 2 - ((CONTENT.top + CONTENT.bottom) / 2) * k;
  const top = Math.min(0, Math.max(visibleH - boxH, want));
  return { width: `${boxW}px`, height: `${boxH}px`, left: `${(w - boxW) / 2}px`, top: `${top}px` };
}

function TopBar({ s, v, now }: { s: State; v: CampView; now: number }) {
  const mana = Math.round(s.hero.mana);
  const lvl = heroLevel(s.hero.xp);
  return (
    <div class="topbar">
      <div class="chip chip-date" aria-label={`${formatDate(s.day)}, ${formatClock(now)}, ${SHIFT_NAME[v.asleep ? 'night' : v.shift]}`}>
        <GIcon name={v.light === 'night' ? 'zzz' : v.light === 'evening' ? 'sunset' : 'sun'} size={15} class="ic-sun" />
        <span class="chip-day">{formatDate(s.day).split(',')[0]}</span>
        {formatClock(now)}
        <span class="chip-shift">{SHIFT_NAME[v.asleep ? 'night' : v.shift]}</span>
      </div>
      <div class="chip chip-gold" aria-label={`${W.gold}: ${s.hero.gold}, уровень героя ${lvl.level}`}>
        <GIcon name="coins" size={17} />
        {s.hero.gold.toLocaleString('ru-RU')}
        <span class="chip-level">ур. {lvl.level}</span>
      </div>
      <div class="chip chip-mana" aria-label={`${W.mana}: ${mana} из ${MANA_MAX}`}>
        <span class="mana-gem" aria-hidden="true" />
        <span class="bar" aria-hidden="true">
          <span style={{ width: `${(mana / MANA_MAX) * 100}%` }} />
        </span>
        {mana}
      </div>
    </div>
  );
}

/** «Позвать к огню», на узком экране короче, чтобы не переносилось. */
export function CallLabel() {
  return (
    <>
      <span class="lbl-long">{W.callToFire}</span>
      <span class="lbl-short">{W.callToFireShort}</span>
    </>
  );
}

function MainCard({ ui, v, timer, seconds }: { ui: Ui; v: CampView; timer: string | null; seconds: string }) {
  const { store, now } = ui;
  const s = store.state;

  if (v.asleep) {
    const l = s.log[s.day];
    return (
      <div class="card">
        <div class="card-head">
          <GIcon name="zzz" size={18} class="ic-gold" />
          <span class="sc">Отряд спит</span>
        </div>
        <div class="card-title">Доброй ночи</div>
        <div class="card-sub">
          Сегодня сделано {l?.done ?? 0}, золота +{l?.gold ?? 0}, опыта +{l?.xp ?? 0}. Завтра силы снова будут полны.
        </div>
        <div class="btns">
          <button class="btn btn-ghost" onClick={() => store.act((st) => reopenDay(st))}>
            {W.notSleeping}
          </button>
        </div>
      </div>
    );
  }

  const cheer = ui.cheer;
  if (cheer) {
    const t = s.tasks.find((x) => x.id === cheer.taskId);
    const next = v.current ?? v.main[0] ?? v.later[0] ?? null;
    const r = cheer.result;
    return (
      <div class="card card-done">
        <div class="card-head">
          <GIcon name="check" size={18} class="ic-green" />
          <span class="sc">Сделано!</span>
          {r.reward.frog && <span class="pill pill-frog">лягушка съедена</span>}
          <button class="link-btn" onClick={() => {
            store.act((st) => undoComplete(st, cheer.taskId));
            ui.setCheer(null);
            ui.toast('Задача снова в плане');
          }}>
            <LIcon name="undo" size={14} />
            Вернуть
          </button>
        </div>
        {t && <div class="card-title card-title-sm">{t.title}</div>}
        <div class="rewards">
          <span class="rw rw-gold">
            <GIcon name="coins" size={15} />+{r.reward.gold} золота
          </span>
          <span class="rw rw-xp">
            +{r.reward.xp} опыта{r.reward.frog ? ', ×2' : ''}
          </span>
          {r.lair && (
            <span class="rw rw-lair">
              {W.lair} {r.lair.before} → {r.lair.after}
            </span>
          )}
          {r.undead && <span class="rw rw-lair">нежить упокоена</span>}
        </div>
        {next ? (
          <>
            <div class="next">
              <span class="next-label">Дальше:</span>
              <span class={`num num-${v.tones.get(next.id) === 'undead' ? 'undead' : 'today'} num-sm`}>{v.numbers.get(next.id)}</span>
              <span class="next-title">{next.title}</span>
            </div>
            <div class="btns">
              <button class="btn btn-gold" onClick={() => callToFire(ui, next)}>
                <GIcon name="campfire" size={18} />
                {next.id === v.current?.id ? W.resume : <CallLabel />}
              </button>
              <button class="btn btn-ghost" onClick={() => { ui.setCheer(null); store.act((st, n) => toggleBreak(st, n)); }}>
                {W.rest}
              </button>
            </div>
          </>
        ) : (
          <div class="btns">
            <button class="btn btn-ghost" onClick={() => ui.setCheer(null)}>
              Отлично
            </button>
            <button class="btn btn-ghost" onClick={() => ui.go('plan')}>
              Собрать ещё
            </button>
          </div>
        )}
      </div>
    );
  }

  if (v.onBreak) {
    const mana = s.hero.mana;
    const fullAt = now + ((MANA_MAX - mana) / MANA_REST_PER_HOUR) * HOUR;
    const restMin = Math.floor((now - (s.breakSince ?? now)) / 60_000);
    return (
      <div class="card card-break">
        <div class="card-head">
          <GIcon name="campfire" size={18} class="ic-fire" />
          <span class="sc">Привал</span>
          <span class="card-head-right">{formatDuration(restMin)}</span>
        </div>
        <div class="card-title">Отряд отдыхает у огня</div>
        <div class="card-sub">
          {mana >= MANA_MAX ? 'Мана полна, можно в путь.' : `Мана растёт на ${MANA_REST_PER_HOUR} в час, полной станет к ${formatClock(fullAt)}.`}
          {v.current && ` Ждёт: ${v.current.title}.`}
        </div>
        <SecondWind ui={ui} />
        <div class="btns btns-one">
          <button class="btn btn-gold" onClick={() => store.act((st, n) => toggleBreak(st, n))}>
            {W.backOnRoad}
          </button>
        </div>
      </div>
    );
  }

  if (v.idle && v.current) {
    const since = s.current?.idleSince ?? now;
    return (
      <div class="card">
        <div class="card-head">
          <GIcon name="hourglass" size={16} class="ic-gold" />
          <span class="sc">Ты ещё у костра?</span>
        </div>
        <div class="card-title card-title-sm">{v.current.title}</div>
        <div class="card-sub">Долго не было отметок, и таймер встал в {formatClock(since)}. Если работа шла всё это время, оно вернётся в задачу.</div>
        <div class="btns">
          <button class="btn btn-gold" onClick={() => store.act((st, n) => confirmWorking(st, n))}>
            {W.stillWorking}
          </button>
          <button class="btn btn-ghost" onClick={() => store.act((st) => dismissIdle(st))}>
            {W.notWorking}
          </button>
        </div>
      </div>
    );
  }

  const cur = v.current;
  if (cur) {
    const q = findQuest(s, cur.questId);
    const est = estimateOf(cur);
    const spent = spentNow(s, cur, now);
    const progress = est ? Math.min(1, spent / (est * 60_000)) : 0;
    const cls = CLASS_BY_LEVEL[cur.level];
    return (
      <div class="card">
        <div class="card-head">
          <span class="num num-current num-sm">{v.numbers.get(cur.id)}</span>
          <span class="sc">{W.nowAtFire}</span>
          {s.frogId === cur.id && (
            <span class="pill pill-frog">
              <GIcon name="frog" size={15} />
              {W.frog}
            </span>
          )}
        </div>
        <button class="card-title-btn" onClick={() => ui.open({ kind: 'task', taskId: cur.id })}>
          <span class="card-title">{cur.title}</span>
        </button>
        <div class="card-sub">
          {q ? q.name : 'Без похода'} · {LEVEL_ROMAN[cur.level]} уровень · {CLASS_AT[cls]}
        </div>
        <div class="timer">
          <GIcon name="hourglass" size={16} class="ic-gold" />
          <span class="timer-val">
            {timer}
            <small>{seconds}</small>
          </span>
          <span class="timer-est">{est ? `из ~${formatDuration(est)}` : 'несколько дней'}</span>
          {est && (
            <span class="bar bar-gold" aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
          )}
        </div>
        {v.running && s.hero.mana < MANA_LOW && <div class="hint">Силы на исходе: самое время для привала.</div>}
        <SecondWind ui={ui} />
        <div class="btns">
          <button class="btn btn-gold" onClick={() => finish(ui, cur)}>
            <GIcon name="check" size={17} />
            {W.done}
          </button>
          {v.running ? (
            <button class="btn btn-ghost" onClick={() => store.act((st, n) => toggleBreak(st, n))}>
              <GIcon name="campfire" size={19} class="ic-fire" />
              {W.rest}
            </button>
          ) : (
            <button class="btn btn-ghost" onClick={() => store.act((st, n) => resume(st, n))}>
              <LIcon name="play" size={16} />
              {W.resume}
            </button>
          )}
        </div>
      </div>
    );
  }

  const next = v.main[0] ?? v.later[0] ?? null;
  if (next) {
    return (
      <div class="card">
        <div class="card-head">
          <GIcon name="campfire" size={18} class="ic-fire" />
          <span class="sc">{W.atFireEmpty}</span>
        </div>
        <div class="next next-big">
          <span class={`num num-${v.tones.get(next.id) ?? 'today'} num-sm`}>{v.numbers.get(next.id)}</span>
          <span class="next-title">{next.title}</span>
          <TaskMeta s={s} t={next} />
        </div>
        <SecondWind ui={ui} />
        <div class="btns">
          <button class="btn btn-gold" onClick={() => callToFire(ui, next)}>
            <GIcon name="campfire" size={18} />
            <CallLabel />
          </button>
          <button class="btn btn-ghost" onClick={() => store.act((st, n) => toggleBreak(st, n))}>
            {W.rest}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="card">
      <div class="card-head">
        <GIcon name="campfire" size={18} class="ic-fire" />
        <span class="sc">{v.doneToday > 0 ? 'План дня выполнен' : 'Отряд не собран'}</span>
      </div>
      <div class="card-sub">
        {v.doneToday > 0
          ? 'Все задачи дня сделаны. Можно позвать ещё кого-то из отряда или отдохнуть.'
          : 'Позови к костру задачи на сегодня: из отряда или новые.'}
      </div>
      <div class="btns">
        <button class="btn btn-gold" onClick={() => ui.go('plan')}>
          <GIcon name="sunrise" size={18} />
          {W.plan}
        </button>
        <button class="btn btn-ghost" onClick={() => ui.open({ kind: 'add', day: s.day })}>
          <LIcon name="plus" size={16} />
          Задача
        </button>
      </div>
    </div>
  );
}

function SecondWind({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  if (!canSecondWind(s, ui.now) || s.hero.mana >= MANA_MAX) return null;
  return (
    <button
      class="wind"
      onClick={() => {
        if (ui.store.act((st, n) => secondWind(st, n))) ui.toast('Второе дыхание: +30 маны');
      }}
    >
      <GIcon name="heart" size={15} />
      {W.secondWind}: ужин или прогулка, +30 маны
    </button>
  );
}

export function callToFire(ui: Ui, t: Task): void {
  ui.setCheer(null);
  const s = ui.store.state;
  if (s.current?.taskId === t.id) {
    ui.store.act((st, n) => resume(st, n));
    return;
  }
  const { switchCost } = ui.store.act((st, n) => start(st, n, t.id));
  if (switchCost) ui.toast(`Смена похода: −${switchCost} маны`);
}

export function finish(ui: Ui, t: Task, level?: 1 | 2 | 3 | 4): void {
  const result = ui.store.act((st, n) => complete(st, n, t.id, level));
  if (result) ui.setCheer({ taskId: t.id, result, until: 0 });
}

function TaskRow({ s, t, n, tone, onClick }: { s: State; t: Task; n: number; tone: Tone; onClick: () => void }) {
  return (
    <button class="row" onClick={onClick}>
      <span class={`num num-${tone} num-sm`} aria-hidden="true">
        {n}
      </span>
      <span class="row-title">{t.title}</span>
      <TaskMeta s={s} t={t} />
    </button>
  );
}
