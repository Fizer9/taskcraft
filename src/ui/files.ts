// Скачать текст файлом: копия игры, отложенное сохранение, отчёт об ошибке.
import type { Store } from '../game/store';
import { updateLocal } from './local';

export function saveFile(name: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari начинает скачивание не сразу: ссылку освобождаем позже.
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Копия игры в файл; устройство запоминает, когда её делали, чтобы не напоминать зря. */
export function downloadGame(store: Store): void {
  saveFile(`lager-${store.state.day}.json`, store.exportJson());
  const now = store.now();
  updateLocal(now, (l) => {
    l.backupAt = now;
  });
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
