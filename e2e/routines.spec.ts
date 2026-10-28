// Повторяющиеся задачи: сами встают в план в свои дни.
import { expect, test } from '@playwright/test';
import { addTask, at, openGame, setTime, sheet, toast } from './helpers';

test('каждый день: сделанная сегодня завтра приходит снова', async ({ page }) => {
  await openGame(page, { time: at(9) });
  await addTask(page, 'Зарядка', { size: '15 мин', repeat: 'Каждый день' });
  await expect(toast(page)).toHaveText('Повторяется каждый день. Сегодня уже у костра');

  const today = page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) });
  const repeating = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Повторяются' }) });
  await expect(repeating).toContainText('каждый день');
  await today.getByRole('button', { name: /^Зарядка/ }).click();

  const card = sheet(page, 'Разбойник');
  await expect(card).toContainText('Повторяется каждый день');
  await card.getByRole('button', { name: 'Готово' }).click();
  await expect(today).toContainText('сегодня уже сделано: 1');

  // Наутро задача снова в плане сама.
  await setTime(page, at(8, 0, 24));
  await expect(page.getByRole('heading', { level: 1, name: 'Сбор отряда' })).toBeVisible();
  await expect(today.getByRole('button', { name: /^Зарядка/ })).toBeVisible();
  await expect(today).not.toContainText('сегодня уже сделано');
});

test('раз в неделю: приходит только в свой день', async ({ page }) => {
  // Пятница. Задача на среду.
  await openGame(page, { time: at(9) });
  await addTask(page, 'Полить цветы', { size: '15 мин', repeat: 'Раз в неделю', weekday: 'среда' });
  await expect(toast(page)).toHaveText('Придёт в среду, а дальше каждую неделю');
  const today = page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) });
  await expect(today.getByRole('button', { name: /^Полить цветы/ })).toHaveCount(0);

  await setTime(page, at(8, 0, 27));
  await expect(today.getByRole('button', { name: /^Полить цветы/ })).toHaveCount(0);
  await setTime(page, at(8, 0, 28));
  await expect(today.getByRole('button', { name: /^Полить цветы/ })).toBeVisible();
});
