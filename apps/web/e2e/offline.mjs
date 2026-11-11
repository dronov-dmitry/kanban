import { chromium } from 'playwright';
import { devLogin } from './login.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:8787';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

function step(name) {
  console.log(`- ${name}`);
}

async function token() {
  return page.evaluate(() => {
    const raw = localStorage.getItem('kanban.session');
    return raw ? JSON.parse(raw).state.accessToken : null;
  });
}

async function cleanup() {
  const auth = await token();
  const snapshot = await (
    await fetch(`${API}/v1/boards/b_product`, { headers: { Authorization: `Bearer ${auth}` } })
  ).json();
  for (const card of snapshot.cards ?? []) {
    if (card.title === 'Offline sync card') {
      await fetch(`${API}/v1/cards/${card.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth}` },
      });
      await fetch(`${API}/v1/cards/${card.id}/permanent`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth}` },
      });
    }
  }
}

try {
  step('sign in through the dev-only session endpoint');
  await devLogin(page, { base: BASE });
  await page.waitForSelector('.board-card', { timeout: 20_000 });
  await page.goto(`${BASE}/app/acme/boards/b_product`);
  await page.waitForSelector('.card-tile', { timeout: 20_000 });

  step('go offline and create a card');
  await context.setOffline(true);
  await page.waitForTimeout(500);
  await page.locator('.column').first().locator('.add-card').click();
  await page.locator('.composer textarea').fill('Offline sync card');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.card-tile:has-text("Offline sync card")', { timeout: 10_000 });
  const pendingVisible = await page.locator('.banner').filter({ hasText: /Офлайн|ждт|ждут/ }).count();
  if (pendingVisible === 0) throw new Error('offline banner did not appear');
  await page.keyboard.press('Escape');

  step('go back online and wait for the outbox');
  await context.setOffline(false);
  await page.waitForTimeout(3000);
  const auth = await token();
  const snapshot = await (
    await fetch(`${API}/v1/boards/b_product`, { headers: { Authorization: `Bearer ${auth}` } })
  ).json();
  const synced = (snapshot.cards ?? []).find((card) => card.title === 'Offline sync card');
  if (!synced) throw new Error('offline mutation was not synced');

  await page.reload();
  await page.waitForSelector('.card-tile', { timeout: 20_000 });
  const visible = await page.locator('.card-tile', { hasText: 'Offline sync card' }).count();
  if (visible === 0) throw new Error('synced card is not visible after reload');

  step('clean up');
  await cleanup();
  console.log('OFFLINE OK');
} catch (error) {
  console.error('OFFLINE FAILED:', error.message);
  await page.screenshot({ path: 'e2e/offline-failure.png', fullPage: true }).catch(() => undefined);
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
