// Значки приложения из ночного костра: node make-icons.mjs (после render.mjs).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const APP = join(import.meta.dirname, '..', '..');
const OUT = join(APP, 'public', 'icons');
const FIRE = join(APP, 'public', 'camp', 'fire-night.webp');

/** Тёмный фон с тёплым отсветом и костёр посередине; fill — доля стороны под костёр. */
async function icon(size, fill, file) {
  const glow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs><radialGradient id="g" cx="50%" cy="56%" r="50%">
        <stop offset="0" stop-color="#7a4416"/><stop offset="0.55" stop-color="#2a1a0e"/><stop offset="1" stop-color="#15110d"/>
      </radialGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`,
  );
  const side = Math.round(size * fill);
  const fire = await sharp(FIRE).resize({ width: side, height: side, fit: 'inside' }).toBuffer({ resolveWithObject: true });
  await sharp(glow)
    .composite([{ input: fire.data, left: Math.round((size - fire.info.width) / 2), top: Math.round((size - fire.info.height) / 2 + size * 0.02) }])
    .png()
    .toFile(join(OUT, file));
  console.log(file);
}

mkdirSync(OUT, { recursive: true });
await icon(192, 0.84, 'icon-192.png');
await icon(512, 0.84, 'icon-512.png');
// Для круглых и квадратных масок Android: костёр внутри безопасной зоны.
await icon(512, 0.6, 'icon-maskable-512.png');
await icon(180, 0.8, 'apple-touch-icon.png');
