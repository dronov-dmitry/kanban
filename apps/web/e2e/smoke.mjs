import { chromium } from 'playwright';
import { devLogin } from './login.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});

function step(name) {
  console.log(`- ${name}`);
}

try {
  step('sign in through the dev-only session endpoint');
  await devLogin(page, { base: BASE });
  await page.waitForSelector('.board-card', { timeout: 20_000 });

  step('workspace board grid is visible');
  await page.waitForSelector('.board-card', { timeout: 20_000 });
  const cards = await page.locator('.board-card').count();
  if (cards < 2) throw new Error(`expected board cards, got ${cards}`);

  step('open the Product board');
  await page.locator('.board-card', { hasText: 'Product' }).first().click();
  await page.waitForURL('**/boards/**', { timeout: 20_000 });
  await page.waitForSelector('.card-tile', { timeout: 20_000 });
  const columns = await page.locator('.column-title').count();
  const tiles = await page.locator('.card-tile').count();
  console.log(`  columns=${columns} cards=${tiles}`);
  if (columns < 3 || tiles < 3) throw new Error('board did not render columns/cards');

  step('open a card and close it with Escape');
  await page.locator('.card-tile').first().click();
  await page.waitForSelector('.modal', { timeout: 15_000 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 10_000 });

  step('add a card through the inline composer');
  await page.locator('.column').first().locator('.add-card').click();
  await page.locator('.composer textarea').fill('E2E smoke card');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const created = await page.locator('.card-tile', { hasText: 'E2E smoke card' }).count();
  if (created === 0) throw new Error('card was not created');
  await page.keyboard.press('Escape');

  step('clean up the smoke card through the API');
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('kanban.session');
    return raw ? JSON.parse(raw).state.accessToken : null;
  });
  if (token) {
    const snapshot = await (
      await fetch('http://localhost:8787/v1/boards/b_product', {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    for (const card of snapshot.cards ?? []) {
      if (card.title === 'E2E smoke card') {
        await fetch(`http://localhost:8787/v1/cards/${card.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.card-tile', { timeout: 15_000 });
  }

  step('switch to the list view');
  await page.getByRole('button', { name: /Список/ }).click();
  await page.waitForSelector('.table tbody tr', { timeout: 15_000 });
  const rows = await page.locator('.table tbody tr').count();
  console.log(`  rows=${rows}`);
  if (rows < 3) throw new Error('list view is empty');

  step('open My tasks');
  await page.goto(`${BASE}/app/acme/my`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 15_000 });

  step('search for a card');
  await page.goto(`${BASE}/app/acme/search`, { waitUntil: 'networkidle' });
  await page.waitForSelector('input.input', { timeout: 15_000 });
  await page.locator('input.input').first().fill('refresh');
  await page.waitForSelector('.notification-row', { timeout: 15_000 });
  const results = await page.locator('.notification-row').count();
  console.log(`  results=${results}`);
  if (results === 0) throw new Error('search returned no results');

  step('open the board and apply the "only mine" filter');
  await page.goto(`${BASE}/app/acme/boards/b_product`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.column', { timeout: 15_000 });
  await page.getByRole('button', { name: /Фильтры/ }).click();
  await page.getByRole('button', { name: /Только мои/ }).click();
  await page.waitForTimeout(600);
  if (!page.url().includes('f=mine')) throw new Error('filter state is not in the URL');
  await page.getByRole('button', { name: /Только мои/ }).click();

  await page.screenshot({ path: 'e2e/board.png', fullPage: true });
  console.log('SMOKE OK');
} catch (error) {
  console.error('SMOKE FAILED:', error.message);
  await page.screenshot({ path: 'e2e/failure.png', fullPage: true }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  if (errors.length > 0) {
    console.error('PAGE ERRORS:');
    for (const error of errors) console.error(`  ${error}`);
    process.exitCode = 1;
  } else {
    console.log('No page errors.');
  }
  await browser.close();
}
