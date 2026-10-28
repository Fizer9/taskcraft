// Сбор отряда: утренний план дня. Кого позвать к костру, кто лягушка, хватит ли сил.
import { MANA_DRAIN_PER_HOUR, MANA_MAX, PLAN_XP_PER_TASK, estimateOf } from '../game/rules';
import { backlogOf, findQuest, inboxOf, isUndead, lightFire, planOf, planTask, swapInPlan, waitingOf } from '../game/state';
import { formatClock, formatDate, formatDuration, isMainFor, plural, shiftAt } from '../game/time';
import type { State, Task } from '../game/types';
import { W, repeatName } from '../game/words';
import type { Ui } from './App';
import { GIcon, LIcon } from './Icon';
import { QuestDot, TaskMeta } from './parts';

export function Plan({ ui }: { ui: Ui }) {
  const { store, now } = ui;
  const s = store.state;
  const plan = planOf(s);
  const open = plan.filter((t) => t.status === 'open');
  const done = plan.length - open.length;
  const shift = shiftAt(now, s.settings);
  const isWorkday = shift === 'morning' || shift === 'work';
  const kindOf = (t: Task) => findQuest(s, t.questId)?.kind ?? 'any';
  const dayTasks = isWorkday ? open.filter((t) => isMainFor(kindOf(t), 'work')) : open;
  const eveningTasks = isWorkday ? open.filter((t) => !isMainFor(kindOf(t), 'work')) : [];
  const backlog = backlogOf(s);
  const undead = backlog.filter((t) => isUndead(t, s.day));
  const rest = backlog.filter((t) => !isUndead(t, s.day));
  const letters = inboxOf(s).length;
  const frog = s.frogId ? plan.find((t) => t.id === s.frogId) : undefined;
  const lit = s.litDay === s.day;

  const planMin = open.reduce((m, t) => m + (estimateOf(t) ?? 0), 0);
  const canMin = Math.round((s.hero.mana / MANA_DRAIN_PER_HOUR) * 60);
  const tooMuch = planMin > canMin;
  const mana = Math.round(s.hero.mana);

  return (
    <div class="page">
      <div class="page-top">
        <span class="page-date">
          <GIcon name="sunrise" size={15} class="ic-sun" />
          {formatDate(s.day)} · {formatClock(now)}
        </span>
        <button class="link-btn" onClick={() => ui.go('camp')}>
          В лагерь
          <LIcon name="chevron" size={16} />
        </button>
      </div>
      <h1 class="page-title">{W.plan}</h1>
      <div class="page-sub">
        {mana >= 95 ? 'Долгий отдых позади, силы полны' : `Сил осталось на ~${formatDuration(canMin)}`}
        <span class="chip chip-mana chip-inline">
          <span class="mana-gem" aria-hidden="true" />
          <span aria-hidden="true">{mana}</span>
          <span class="sr-only">{`${W.mana}: ${mana} из ${MANA_MAX}`}</span>
        </span>
      </div>

      {letters > 0 && (
        <button class="banner" onClick={() => ui.open({ kind: 'letters' })}>
          <LIcon name="envelope" size={16} />
          Вестник принёс {letters} {plural(letters, 'письмо', 'письма', 'писем')}: разобрать
          <LIcon name="chevron" size={16} />
        </button>
      )}

      <button class="frog-card" onClick={() => ui.open({ kind: 'frog' })}>
        <GIcon name="frog" size={28} class="ic-green" />
        <span class="frog-body">
          <span class="sc">{W.frogTitle}</span>
          {frog ? (
            <>
              <span class="frog-title">{frog.title}</span>
              <span class="frog-sub">Опыт ×2. Лучше браться за неё первой</span>
            </>
          ) : (
            <span class="frog-sub">Выбери самую тяжёлую задачу дня: опыт за неё удвоится</span>
          )}
        </span>
        <span class="link-btn">{frog ? 'сменить' : 'выбрать'}</span>
      </button>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">К костру сегодня</h2>
          <span class="group-meta">
            {open.length} {plural(open.length, 'задача', 'задачи', 'задач')}
            {planMin > 0 && ` · ~${formatDuration(planMin)}`}
          </span>
        </div>
        {open.length > 0 && (
          <div class={`capacity${tooMuch ? ' is-over' : ''}`}>
            <span class="bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (planMin / Math.max(canMin, 1)) * 100)}%` }} />
            </span>
            <span>
              План на ~{formatDuration(planMin)}, а сил хватит на ~{formatDuration(canMin)}
              {tooMuch && '. Многовато: кого-то стоит оставить на завтра'}
            </span>
          </div>
        )}
        {dayTasks.length === 0 && eveningTasks.length === 0 && <p class="note">Пока никого. Позови задачи из отряда ниже или добавь новую.</p>}
        {dayTasks.map((t, i) => (
          <PlanRow key={t.id} ui={ui} s={s} t={t} prev={dayTasks[i - 1]} next={dayTasks[i + 1]} />
        ))}
        {done > 0 && (
          <div class="done-line">
            <GIcon name="check" size={13} />
            сегодня уже сделано: {done}
          </div>
        )}
      </section>

      {eveningTasks.length > 0 && (
        <section class="group">
          <div class="group-head">
            <h2 class="sc">После заката</h2>
          </div>
          {eveningTasks.map((t, i) => (
            <PlanRow key={t.id} ui={ui} s={s} t={t} prev={eveningTasks[i - 1]} next={eveningTasks[i + 1]} />
          ))}
        </section>
      )}

      {undead.length > 0 && (
        <section class="group">
          <div class="group-head">
            <h2 class="sc">{W.undead}</h2>
            <span class="group-meta">просроченные задачи</span>
          </div>
          {undead.map((t) => (
            <AddRow key={t.id} ui={ui} s={s} t={t} />
          ))}
        </section>
      )}

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Из отряда</h2>
          <button class="link-btn" aria-label="Новая задача" onClick={() => ui.open({ kind: 'add', day: null })}>
            <LIcon name="plus" size={15} />
            новая
          </button>
        </div>
        {rest.length === 0 && (
          <p class="note">
            {s.tasks.some((t) => t.status === 'open' || t.status === 'inbox') ? 'В отряде никого, кроме уже позванных.' : 'Отряд пуст. Добавь первую задачу: кнопка «+ новая» выше или большой «+» внизу.'}
          </p>
        )}
        {groupByQuest(s, rest).map(([qid, tasks]) => {
          const q = findQuest(s, qid);
          return (
            <div key={qid ?? 'none'} class="quest-group">
              <div class="quest-name">
                <QuestDot q={q} />
                {q?.name ?? 'Без похода'}
              </div>
              {tasks.map((t) => (
                <AddRow key={t.id} ui={ui} s={s} t={t} />
              ))}
            </div>
          );
        })}
      </section>

      {s.routines.length > 0 && (
        <section class="group">
          <div class="group-head">
            <h2 class="sc">Повторяются</h2>
            <span class="group-meta">приходят к костру сами</span>
          </div>
          {s.routines.map((r) => {
            const w = waitingOf(s, r.id);
            return (
              <button key={r.id} class="row" onClick={() => ui.open(w ? { kind: 'edit', taskId: w.id } : { kind: 'routine', routineId: r.id })}>
                <LIcon name="repeat" size={15} class="ic-gold" />
                <span class="row-title">{r.title}</span>
                <span class="meta">
                  {repeatName(r.repeat)}
                  {r.at && `, в ${r.at}`}
                </span>
              </button>
            );
          })}
        </section>
      )}

      <div class="page-foot">
        {lit ? (
          <button class="btn btn-ghost btn-wide" onClick={() => ui.go('camp')}>
            Вернуться в лагерь
          </button>
        ) : (
          <button
            class="btn btn-gold btn-wide"
            onClick={() => {
              const xp = store.act((st, n) => lightFire(st, n));
              ui.toast(xp > 0 ? `Костёр горит: +${xp} опыта за план` : 'Костёр горит');
              ui.go('camp');
            }}
          >
            <GIcon name="campfire" size={19} />
            {W.lightFire}
            {open.length > 0 && <small class="btn-cost">+{open.length * PLAN_XP_PER_TASK} опыта</small>}
          </button>
        )}
      </div>
    </div>
  );
}

function groupByQuest(s: State, tasks: Task[]): [string | null, Task[]][] {
  const order = new Map(s.quests.map((q, i) => [q.id, i]));
  const groups = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const k = t.questId && order.has(t.questId) ? t.questId : null;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  return [...groups.entries()].sort((a, b) => (order.get(a[0] ?? '') ?? 99) - (order.get(b[0] ?? '') ?? 99));
}

/**
 * Строка плана уезжает выше, ниже или уходит из списка, и браузер теряет фокус.
 * Вернуть его на ту же кнопку, на другую кнопку строки или на соседнюю строку, чтобы с клавиатуры и с экранным диктором не начинать с начала страницы.
 */
function keepFocus(e: Event, act: () => void) {
  const btn = e.currentTarget as HTMLButtonElement;
  const row = btn.closest('.prow');
  const near = [row?.nextElementSibling, row?.previousElementSibling].map((r) => r?.querySelector<HTMLElement>('.prow-main') ?? null);
  const section = btn.closest('section');
  act();
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    const same = btn.isConnected && !btn.disabled ? btn : null;
    const other = row?.isConnected ? row.querySelector<HTMLElement>('.icon-btn:not(:disabled)') : null;
    const inSection = section?.isConnected ? section.querySelector<HTMLElement>('.prow-main, .link-btn') : null;
    [same, other, ...near, inSection].find((el) => el?.isConnected)?.focus();
  });
}

function PlanRow({ ui, s, t, prev, next }: { ui: Ui; s: State; t: Task; prev?: Task; next?: Task }) {
  return (
    <div class="prow">
      <button class="prow-main" onClick={() => ui.open({ kind: 'task', taskId: t.id })}>
        {s.frogId === t.id ? <GIcon name="frog" size={16} class="ic-green" /> : <QuestDot q={findQuest(s, t.questId)} />}
        <span class="row-title">{t.title}</span>
        <TaskMeta s={s} t={t} estimate />
      </button>
      <button class="icon-btn" aria-label={`Выше: ${t.title}`} disabled={!prev} onClick={(e) => keepFocus(e, () => ui.store.act((st) => prev && swapInPlan(st, t.id, prev.id)))}>
        <LIcon name="up" size={16} />
      </button>
      <button class="icon-btn" aria-label={`Ниже: ${t.title}`} disabled={!next} onClick={(e) => keepFocus(e, () => ui.store.act((st) => next && swapInPlan(st, t.id, next.id)))}>
        <LIcon name="down" size={16} />
      </button>
      <button class="icon-btn" aria-label={`Не сегодня: ${t.title}`} onClick={(e) => keepFocus(e, () => ui.store.act((st) => planTask(st, t.id, null)))}>
        <LIcon name="close" size={16} />
      </button>
    </div>
  );
}

function AddRow({ ui, s, t }: { ui: Ui; s: State; t: Task }) {
  return (
    <div class="prow">
      <button class="prow-main" onClick={() => ui.open({ kind: 'task', taskId: t.id })}>
        <span class="row-title">{t.title}</span>
        <TaskMeta s={s} t={t} />
      </button>
      <button class="icon-btn icon-btn-gold" aria-label={`К костру сегодня: ${t.title}`} onClick={(e) => keepFocus(e, () => ui.store.act((st) => planTask(st, t.id, st.day)))}>
        <LIcon name="plus" size={18} stroke={2.4} />
      </button>
    </div>
  );
}
