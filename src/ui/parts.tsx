// Мелкие общие куски интерфейса.
import { estimateOf } from '../game/rules';
import { daysOverdue, findQuest, isUndead } from '../game/state';
import { formatDue, formatDuration, plural } from '../game/time';
import type { Quest, State, Task } from '../game/types';
import { LEVEL_ROMAN } from '../game/words';
import { GIcon } from './Icon';

/** Подпись справа в строке задачи: нежить, время, срок или оценка. */
export function TaskMeta({ s, t, estimate = false }: { s: State; t: Task; estimate?: boolean }) {
  if (isUndead(t, s.day)) {
    const d = daysOverdue(t, s.day);
    return (
      <span class="meta meta-undead">
        <GIcon name="skull" size={12} />
        {d} {plural(d, 'день', 'дня', 'дней')}
      </span>
    );
  }
  if (t.at) return <span class="meta">в {t.at}</span>;
  if (t.due === s.day) return <span class="meta meta-gold">сегодня</span>;
  if (estimate) {
    const e = estimateOf(t);
    return <span class="meta">{e ? formatDuration(e) : 'дни'}</span>;
  }
  if (t.due) return <span class="meta">{formatDue(t.due, s.day)}</span>;
  return <span class="meta">{LEVEL_ROMAN[t.level]} ур.</span>;
}

export function QuestDot({ q }: { q: Quest | undefined }) {
  return <span class={`qdot qdot-${q?.color ?? 'none'}`} aria-hidden="true" />;
}

export function questName(s: State, t: Task): string {
  return findQuest(s, t.questId)?.name ?? 'Письмо без похода';
}

export function Chips<T extends string | number | null>(p: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class="field">
      <div class="field-label">{p.label}</div>
      <div class="chips" role="radiogroup" aria-label={p.label}>
        {p.options.map((o) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === p.value}
            class={`chipbtn${o.value === p.value ? ' is-on' : ''}`}
            onClick={() => p.onChange(o.value)}
            type="button"
          >
            {o.label}
            {o.hint && <small>{o.hint}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}
