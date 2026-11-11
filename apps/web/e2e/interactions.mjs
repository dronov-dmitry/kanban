import { chromium } from 'playwright';
import { devLogin } from './login.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:8787';
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

async function token() {
  return page.evaluate(() => {
    const raw = localStorage.getItem('kanban.session');
    return raw ? JSON.parse(raw).state.accessToken : null;
  });
}

async function api(path, options = {}) {
  const auth = await token();
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${auth}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`API ${path} -> ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

try {
  step('sign in through the dev-only session endpoint');
  await devLogin(page, { base: BASE });
  await page.waitForSelector('.board-card', { timeout: 20_000 });
  await page.goto(`${BASE}/app/acme/boards/b_product`);
  await page.waitForSelector('.card-tile', { timeout: 20_000 });

  step('drag a card from Backlog to Review');
  const source = page.locator('.card-tile', { hasText: 'Проверить доступность форм' }).first();
  const target = page.locator('.column', { hasText: 'Ревью' }).first();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('drag boxes not found');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 30, sourceBox.y + 40, { steps: 5 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 120, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const inReview = await target.locator('.card-tile', { hasText: 'Проверить доступность форм' }).count();
  if (inReview === 0) throw new Error('drag and drop did not move the card');
  await api('/v1/cards/c_3/move', {
    method: 'POST',
    body: JSON.stringify({ listId: 'l_backlog', position: `zz${Date.now()}` }),
  });

  step('open a card and edit the title with autosave');
  await page.reload();
  await page.waitForSelector('.card-tile', { timeout: 20_000 });
  await page.locator('.card-tile', { hasText: 'Спроектировать схему данных' }).first().click();
  await page.waitForSelector('.modal', { timeout: 15_000 });
  const titleInput = page.locator('.card-modal-title');
  await page.waitForFunction(
    () => (document.querySelector('.card-modal-title')?.value?.length ?? 0) > 0,
    { timeout: 15_000 },
  );
  const originalTitle = await titleInput.inputValue();
  await titleInput.fill(`${originalTitle} E2E`);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForSelector('.card-tile', { timeout: 20_000 });
  await page.locator('.card-tile', { hasText: 'Спроектировать схему данных' }).first().click();
  await page.waitForSelector('.modal', { timeout: 15_000 });
  const savedTitle = await page.locator('.card-modal-title').inputValue();
  if (!savedTitle.endsWith('E2E')) throw new Error(`title was not autosaved: ${savedTitle}`);
  await page.locator('.card-modal-title').fill(originalTitle);
  await page.waitForTimeout(1200);

  step('add and delete a comment');
  await page.locator('.comment-composer textarea').fill('E2E comment');
  await page.getByRole('button', { name: /Отправить/ }).click();
  await page.waitForSelector('.comment:has-text("E2E comment")', { timeout: 15_000 });
  await page
    .locator('.comment', { hasText: 'E2E comment' })
    .getByRole('button', { name: 'Удалить' })
    .click();
  await page.waitForSelector('.comment:has-text("E2E comment")', { state: 'detached', timeout: 15_000 });
  await page.keyboard.press('Escape');

  step('toggle a checklist item');
  await page.locator('.card-tile', { hasText: 'Реализовать авторизацию' }).first().click();
  await page.waitForSelector('.modal', { timeout: 15_000 });
  const item = page.locator('.checklist-item', { hasText: 'Ротация refresh' });
  const checkbox = item.locator('input[type="checkbox"]');
  const before = await checkbox.isChecked();
  await checkbox.click();
  let changed = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(300);
    const cardData = await api('/v1/cards/c_4');
    const checklistItem = cardData.card.checklists
      .flatMap((checklist) => checklist.items)
      .find((entry) => entry.text === 'Ротация refresh');
    if (Boolean(checklistItem.is_done) !== before) {
      changed = true;
      break;
    }
  }
  if (!changed) throw new Error('checklist toggle was not saved');
  await checkbox.click();
  await page.waitForTimeout(1200);

  step('upload and delete an attachment');
  await page.setInputFiles('#attachment-input', {
    name: 'e2e-note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello from e2e'),
  });
  await page.waitForSelector('.attachment-row:has-text("e2e-note.txt")', { timeout: 15_000 });
  await page
    .locator('.attachment-row', { hasText: 'e2e-note.txt' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await page.waitForSelector('.attachment-row:has-text("e2e-note.txt")', {
    state: 'detached',
    timeout: 15_000,
  });
  await page.keyboard.press('Escape');

  await page.screenshot({ path: 'e2e/interactions.png', fullPage: true });
  console.log('INTERACTIONS OK');
} catch (error) {
  console.error('INTERACTIONS FAILED:', error.message);
  await page.screenshot({ path: 'e2e/interactions-failure.png', fullPage: true }).catch(() => undefined);
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
