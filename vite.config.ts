/// <reference types="node" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

/** Номер версии из package.json и коммит, из которого собрано: их видно в Летописи и в отчёте об ошибке. */
function buildInfo(): { version: string; build: string } {
  const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
  let sha = process.env.GITHUB_SHA ?? '';
  if (!sha) {
    try {
      sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      sha = '';
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  return { version, build: sha ? `${date}, ${sha.slice(0, 7)}` : date };
}

const info = buildInfo();

export default defineConfig({
  base: './',
  plugins: [preact()],
  define: {
    __APP_VERSION__: JSON.stringify(info.version),
    __APP_BUILD__: JSON.stringify(info.build),
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
