// Сцена лагеря: готовая картинка поляны, фигурки отряда и метки поверх.
import { plural } from '../game/time';
import type { CampView, Tone } from '../game/view';
import type { Task } from '../game/types';
import { CLASS_NAME, UNDEAD_NAME } from '../game/words';
import { SCENE, SCENE_H, SCENE_W, assetUrl, pct, spriteKey, type Sprite } from '../scene/scene';
import { LIcon } from './Icon';

interface Figure {
  key: string;
  spot: string;
  sprite: Sprite | undefined;
  fallback: string;
  label: string;
  task: Task;
  n: number;
  tone: Tone;
  extra?: preact.ComponentChildren;
  pulse?: boolean;
  zz?: boolean;
}

export function Scene(p: {
  view: CampView;
  timer: string | null;
  onTask: (id: string) => void;
  onLetters: () => void;
  onMore: () => void;
}) {
  const { view: v } = p;
  const figures: Figure[] = [];

  if (v.ring) {
    const spot = 'ring';
    figures.push({
      key: `ring-${v.ring.task.id}`,
      spot,
      sprite: SCENE.sprites[spriteKey(spot, v.ring.cls, v.ring.pose)],
      fallback: v.ring.cls,
      label: `${CLASS_NAME[v.ring.cls]} у огня: ${v.ring.task.title}`,
      task: v.ring.task,
      n: v.numbers.get(v.ring.task.id) ?? 0,
      tone: 'current',
      pulse: v.ring.pose === 'work',
      extra: p.timer && v.ring.pose !== 'cheer' ? <span class="tag tag-timer">{p.timer}</span> : null,
    });
  }
  for (const f of v.seats) {
    const spot = `seat${f.seat}`;
    figures.push({
      key: `seat-${f.task.id}`,
      spot,
      sprite: SCENE.sprites[spriteKey(spot, f.cls, f.pose)],
      fallback: f.cls,
      label: `${CLASS_NAME[f.cls]} у костра: ${f.task.title}`,
      task: f.task,
      n: v.numbers.get(f.task.id) ?? 0,
      tone: f.tone,
      zz: f.pose === 'lie',
    });
  }
  for (const r of v.road) {
    const spot = `road${r.spot}`;
    figures.push({
      key: `road-${r.task.id}`,
      spot,
      sprite: SCENE.sprites[spriteKey(spot, `skeleton-${r.rank}`, 'stand')],
      fallback: 'skeleton',
      // Сколько дней просрочено, видно в списке и в карточке: на дороге метки сроков налезали бы друг на друга.
      label: `${UNDEAD_NAME[r.rank]} на дороге, ${r.days} ${plural(r.days, 'день', 'дня', 'дней')}: ${r.task.title}`,
      task: r.task,
      n: v.numbers.get(r.task.id) ?? 0,
      tone: 'undead',
    });
  }

  const bg = SCENE.backgrounds[v.light] ?? SCENE.backgrounds.day;
  const fire = SCENE.fire;
  const msg = SCENE.messenger;
  // Дальние рисуем раньше, ближние поверх, по точке, где фигура стоит: картинки шире фигур из-за теней.
  // Костёр отдельным слоем закрывает тех, кто сидит за ним.
  const sorted = [...figures].sort((a, b) => feetOf(a) - feetOf(b));
  const fireLayer = SCENE.layers?.[`fire/${v.light}`];
  const layers: { key: string; sprite: Sprite; feet: number; f?: Figure }[] = sorted
    .filter((f) => f.sprite)
    .map((f) => ({ key: f.key, sprite: f.sprite!, feet: feetOf(f), f }));
  // Слой костра снят при своём свете, вечерний и ночной фильтры ему не нужны.
  if (fireLayer) layers.push({ key: 'fire', sprite: { ...fireLayer, lit: true }, feet: fire[1] });
  layers.sort((a, b) => a.feet - b.feet);

  return (
    <div class={`scene light-${v.light}${v.onBreak ? ' is-break' : ''}${v.asleep ? ' is-asleep' : ''}`}>
      {bg ? (
        <img class="scene-bg" src={assetUrl(bg)} alt="" draggable={false} />
      ) : (
        <div class="scene-bg scene-bg-fallback" />
      )}
      <div
        class="scene-fire"
        aria-hidden="true"
        style={{ left: pct(fire[0], SCENE_W), top: pct(fire[1], SCENE_H) }}
      />
      {sorted
        .filter((f) => !f.sprite)
        .map((f) => (
          <FigureFallback key={f.key} f={f} />
        ))}
      {layers.map((l) => (
        <SpriteImg key={l.key} s={l.sprite} undead={l.f?.tone === 'undead'} />
      ))}
      {sorted.map((f) => (
        <FigureBadge key={`b-${f.key}`} f={f} onTask={p.onTask} />
      ))}
      {(v.extraSeated > 0 || v.extraRoad > 0) && (
        <button class="scene-more" style={{ left: pct(fire[0], SCENE_W), top: pct(fire[1] + 150, SCENE_H) }} onClick={p.onMore}>
          {v.extraSeated > 0 && `ещё ${v.extraSeated} у костра`}
          {v.extraSeated > 0 && v.extraRoad > 0 && ' · '}
          {v.extraRoad > 0 && `ещё ${v.extraRoad} на дороге`}
        </button>
      )}
      {v.inbox > 0 && (
        <button
          class="scene-letters"
          style={{ left: pct(msg[0], SCENE_W), top: pct(msg[1], SCENE_H) }}
          onClick={p.onLetters}
          aria-label={`Письма у вестника: ${v.inbox}`}
        >
          <LIcon name="envelope" size={16} stroke={2.2} />
          {v.inbox}
        </button>
      )}
    </div>
  );
}

function feetOf(f: Figure): number {
  return SCENE.spots[f.spot]?.[1] ?? (f.sprite ? f.sprite.y + f.sprite.h : 0);
}

function SpriteImg({ s, undead }: { s: Sprite; undead: boolean }) {
  return (
    <img
      class={`fig${undead ? ' fig-undead' : ''}${s.lit ? ' fig-lit' : ''}`}
      src={assetUrl(s.file)}
      alt=""
      draggable={false}
      style={{ left: pct(s.x, SCENE_W), top: pct(s.y, SCENE_H), width: pct(s.w, SCENE_W) }}
    />
  );
}

/** Пока картинки фигур не сняты, на их местах цветные заглушки. */
function FigureFallback({ f }: { f: Figure }) {
  const [x, y] = SCENE.spots[f.spot] ?? [0, 0];
  return <span class={`fig-fallback fig-${f.fallback}`} style={{ left: pct(x, SCENE_W), top: pct(y, SCENE_H) }} />;
}

function FigureBadge({ f, onTask }: { f: Figure; onTask: (id: string) => void }) {
  let x: number;
  let y: number;
  if (f.sprite?.head) {
    [x, y] = f.sprite.head;
    y -= 4;
  } else if (f.sprite) {
    x = f.sprite.x + f.sprite.w / 2;
    y = f.sprite.y + 6;
  } else {
    [x, y] = SCENE.spots[f.spot] ?? [0, 0];
    y -= 40;
  }
  return (
    <div
      class={`fig-mark${f.n > 0 ? '' : ' fig-mark-free'}${x > SCENE_W * 0.62 ? ' fig-mark-left' : ''}`}
      style={{ left: pct(x, SCENE_W), top: pct(y, SCENE_H) }}
    >
      {f.n > 0 && (
        <button class={`num num-${f.tone}${f.pulse ? ' is-pulse' : ''}`} aria-label={f.label} onClick={() => onTask(f.task.id)}>
          {f.n}
        </button>
      )}
      {f.extra}
      {f.zz && (
        <span class="zz" aria-hidden="true">
          z<small>z</small>
        </span>
      )}
    </div>
  );
}
