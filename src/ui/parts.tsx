// Мелкие общие куски интерфейса.
import { estimateOf } from '../game/rules';
import { daysOverdue, findQuest, findRoutine, isUndead } from '../game/state';
import { formatDue, formatDuration, plural } from '../game/time';
import type { Level, Quest, State, Task } from '../game/types';
import { LEVEL_ROMAN } from '../game/words';
import { GIcon, LIcon } from './Icon';

/** Подпись справа в строке задачи: нежить, время, срок или оценка. У повторяющейся перед ней значок. */
export function TaskMeta({ s, t, estimate = false }: { s: State; t: Task; estimate?: boolean }) {
  const repeat = t.status !== 'done' && findRoutine(s, t.routineId) && (
    <>
      <LIcon name="repeat" size={13} class="ic-gold" />
      <span class="sr-only">повторяется,</span>
    </>
  );
  if (isUndead(t, s.day)) {
    const d = daysOverdue(t, s.day);
    return (
      <span class="meta meta-undead">
        <GIcon name="skull" size={12} />
        <span class="sr-only">просрочена на</span> {d} {plural(d, 'день', 'дня', 'дней')}
      </span>
    );
  }
  if (t.at) return <span class="meta">{repeat}в {t.at}</span>;
  if (t.due === s.day) return <span class="meta meta-gold">сегодня</span>;
  if (estimate) {
    const e = estimateOf(t);
    return <span class="meta">{repeat}{e ? formatDuration(e) : 'дни'}</span>;
  }
  if (t.due) return <span class="meta">{formatDue(t.due, s.day)}</span>;
  return (
    <span class="meta">
      {repeat}
      <LevelMark level={t.level} short />
    </span>
  );
}

/** Уровень римской цифрой. Экранный диктор читает «уровень 2», а не латинские буквы. */
export function LevelMark({ level, short = false }: { level: Level; short?: boolean }) {
  return (
    <>
      <span aria-hidden="true">
        {LEVEL_ROMAN[level]} {short ? 'ур.' : 'уровень'}
      </span>
      <span class="sr-only">уровень {level}</span>
    </>
  );
}

export function QuestDot({ q }: { q: Quest | undefined }) {
  return <span class={`qdot qdot-${q?.color ?? 'none'}`} aria-hidden="true" />;
}

export function questName(s: State, t: Task): string {
  return findQuest(s, t.questId)?.name ?? (t.status === 'inbox' ? 'Письмо без похода' : 'Без похода');
}

/** Выбор одного из вариантов. Как у радиокнопок: Tab попадает на выбранный, стрелки выбирают соседний. */
export function Chips<T extends string | number | null>(p: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string; sr?: string }[];
  onChange: (v: T) => void;
}) {
  const at = p.options.findIndex((o) => o.value === p.value);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = p.options.length;
    const i = ((at < 0 ? 0 : at + step) + n) % n;
    p.onChange(p.options[i].value);
    const group = (e.currentTarget as HTMLElement).parentElement;
    requestAnimationFrame(() => (group?.children[i] as HTMLElement | undefined)?.focus());
  };
  return (
    <div class="field">
      <div class="field-label">{p.label}</div>
      <div class="chips" role="radiogroup" aria-label={p.label}>
        {p.options.map((o, i) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === p.value}
            tabIndex={i === (at < 0 ? 0 : at) ? 0 : -1}
            class={`chipbtn${o.value === p.value ? ' is-on' : ''}`}
            onClick={() => p.onChange(o.value)}
            onKeyDown={onKey}
            type="button"
          >
            <ChipText label={o.label} sr={o.sr} />
            {o.hint && <small>{o.hint}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Надпись на кнопке-фишке. sr: что вместо неё прочтёт экранный диктор, если надпись сокращена. */
export function ChipText({ label, sr }: { label: string; sr?: string }) {
  if (!sr) return <>{label}</>;
  return (
    <>
      <span aria-hidden="true">{label}</span>
      <span class="sr-only">{sr}</span>
    </>
  );
}
