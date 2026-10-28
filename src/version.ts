// Версия сборки: подставляется при сборке из package.json и git (vite.config.ts).
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

export const VERSION = __APP_VERSION__;
/** Дата сборки и коммит. */
export const BUILD = __APP_BUILD__;
