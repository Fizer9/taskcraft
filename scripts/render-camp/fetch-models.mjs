// Скачивает нужные паки KayKit (CC0) с GitHub в ./kaykit. Нужен git.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, 'kaykit');
const PACKS = {
  'KayKit-Character-Pack-Adventures-1.0': ['/addons/kaykit_character_pack_adventures/Characters/gltf/*'],
  'KayKit-Character-Pack-Skeletons-1.0': [
    '/addons/kaykit_character_pack_skeletons/Characters/gltf/*',
    '/addons/kaykit_character_pack_skeletons/Assets/gltf/*',
  ],
  'KayKit-Medieval-Hexagon-Pack-1.0': ['/addons/kaykit_medieval_hexagon_pack/Assets/gltf/decoration/*'],
  'KayKit-Dungeon-Remastered-1.0': [
    '/addons/kaykit_dungeon_remastered/Assets/gltf/chest_gold.glb',
    '/addons/kaykit_dungeon_remastered/Assets/gltf/coin_stack_*',
    '/addons/kaykit_dungeon_remastered/Assets/gltf/keg*',
  ],
  'KayKit-Halloween-Bits-1.0': ['/addons/kaykit_halloween_bits/Assets/gltf/*'],
};

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'inherit' });

mkdirSync(ROOT, { recursive: true });
for (const [repo, paths] of Object.entries(PACKS)) {
  const dir = join(ROOT, repo);
  if (!existsSync(dir)) {
    git(ROOT, 'clone', '--depth', '1', '--filter=blob:none', '--no-checkout', `https://github.com/KayKit-Game-Assets/${repo}`);
  }
  git(dir, 'sparse-checkout', 'init', '--no-cone');
  git(dir, 'sparse-checkout', 'set', ...paths, '/LICENSE*');
  git(dir, 'checkout', 'main');
}
console.log('Модели KayKit лежат в', ROOT);
