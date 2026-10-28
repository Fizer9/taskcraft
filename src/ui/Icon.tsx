import { GAME_ICONS, LINE_ICONS, type GameIcon, type LineIcon } from './icons';

export function GIcon({ name, size = 16, class: cls }: { name: GameIcon; size?: number; class?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 512 512" width={size} height={size} class={cls}>
      <path fill="currentColor" d={GAME_ICONS[name]} />
    </svg>
  );
}

export function LIcon({ name, size = 18, class: cls, stroke = 2 }: { name: LineIcon; size?: number; class?: string; stroke?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} class={cls}>
      <path d={LINE_ICONS[name]} fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
