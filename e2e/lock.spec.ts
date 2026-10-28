/// <reference types="node" />
// Пароль сайта. Проверяется, только если dist/ собран с паролем (LAGER_PASSWORD при сборке и при тестах).
import { expect, test } from '@playwright/test';
import { LOCKED, axe } from './helpers';

test.skip(!LOCKED, 'сайт собран без пароля');

test('неверный пароль не пускает, верный открывает игру и запоминается', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Лагерь у костра' })).toBeVisible();
  const pass = page.getByLabel('Пароль');
  await expect(pass).toBeFocused();

  await pass.fill('не тот пароль');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByRole('alert')).toHaveText('Пароль не подошёл.');
  await expect(page.locator('.app')).toHaveCount(0);
  expect(await axe(page), 'страница входа').toEqual([]);

  await pass.fill(process.env.LAGER_PASSWORD ?? '');
  await expect(page.getByLabel('Запомнить на этом устройстве')).toBeChecked();
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.locator('.app')).toBeVisible();

  await page.reload();
  await expect(page.locator('.app')).toBeVisible();
  await expect(page.getByLabel('Пароль')).toHaveCount(0);
});

test('без «Запомнить» новая вкладка снова спрашивает пароль', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('./');
  await page.getByLabel('Пароль').fill(process.env.LAGER_PASSWORD ?? '');
  await page.getByLabel('Запомнить на этом устройстве').uncheck();
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.locator('.app')).toBeVisible();

  const other = await context.newPage();
  await other.goto('./');
  await expect(other.getByLabel('Пароль')).toBeVisible();
  await context.close();
});
