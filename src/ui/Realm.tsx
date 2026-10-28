// Королевство: все походы с их логовами и зал трофеев.
import { lairOf } from '../game/state';
import { QUEST_KIND_NAME, W } from '../game/words';
import type { Ui } from './App';
import { GIcon, LIcon } from './Icon';
import { QuestDot } from './parts';

export function Realm({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const active = s.quests.filter((q) => !q.wonAt);
  const won = s.quests.filter((q) => q.wonAt).sort((a, b) => (b.wonAt ?? 0) - (a.wonAt ?? 0));
  return (
    <div class="page">
      <h1 class="page-title">{W.realm}</h1>
      <div class="page-sub">Походы это большие цели. У каждого своё логово: каждая сделанная задача бьёт по нему своим уровнем.</div>

      <section class="group">
        <div class="group-head">
          <span class="sc">{W.quests}</span>
          <button class="link-btn" onClick={() => ui.open({ kind: 'newQuest' })}>
            <LIcon name="plus" size={15} />
            новый поход
          </button>
        </div>
        {active.map((q) => {
          const lair = lairOf(s, q.id);
          const open = s.tasks.filter((t) => t.questId === q.id && t.status === 'open').length;
          return (
            <button key={q.id} class="quest-card" onClick={() => ui.open({ kind: 'quest', questId: q.id })}>
              <span class="quest-card-top">
                <QuestDot q={q} />
                <span class="quest-card-name">{q.name}</span>
                <span class="meta">{QUEST_KIND_NAME[q.kind]}</span>
              </span>
              <span class="quest-card-sub">
                {open} в отряде
                {lair.max > 0 && ` · логово ${lair.hp} / ${lair.max}`}
              </span>
              {lair.max > 0 && (
                <span class="bar bar-red" aria-hidden="true">
                  <span style={{ width: `${(lair.hp / lair.max) * 100}%` }} />
                </span>
              )}
            </button>
          );
        })}
        {active.length === 0 && <p class="note">Походов нет. Начни новый: например, «Сертификат», «Здоровье» или «Канал в Telegram».</p>}
      </section>

      <section class="group">
        <div class="group-head">
          <span class="sc">{W.trophies}</span>
        </div>
        {won.length === 0 && <p class="note">Пока пусто. Когда логово похода падёт, его знамя появится здесь.</p>}
        {won.map((q) => (
          <div key={q.id} class="trophy">
            <GIcon name="kingdom" size={20} class="ic-gold" />
            <span class="row-title">{q.name}</span>
            <span class="meta">{new Date(q.wonAt!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
