// Карта лагеря: картинки и места. camp.json пишет скрипт scripts/render-camp.
import camp from './camp.json';
import type { Light } from '../game/time';

export interface Sprite {
  file: string;
  /** Прямоугольник фигуры в пикселях полной картинки. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Снято уже при ночном свете, ночной фильтр к ней не нужен. */
  lit?: boolean;
  /** Макушка фигуры: над ней встаёт номер задачи. */
  head?: [number, number];
}

interface CampManifest {
  /** Меняется при каждой съёмке сцены, чтобы новые картинки не застревали в кэше. */
  version?: string;
  size: [number, number];
  fire: [number, number];
  chest: [number, number];
  messenger: [number, number];
  backgrounds: Partial<Record<Light, string>>;
  /** Части фона, которые рисуются поверх фигур за ними: костёр по свету, fire/day и т. п. */
  layers?: Record<string, Sprite>;
  spots: Record<string, [number, number]>;
  sprites: Record<string, Sprite>;
}

export const SCENE = camp as unknown as CampManifest;
export const [SCENE_W, SCENE_H] = SCENE.size;

export function spriteKey(spot: string, who: string, pose: string): string {
  return `${spot}/${who}/${pose}`;
}

export function assetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}camp/${file}${SCENE.version ? `?v=${SCENE.version}` : ''}`;
}

export function pct(v: number, of: number): string {
  return `${((v / of) * 100).toFixed(3)}%`;
}
