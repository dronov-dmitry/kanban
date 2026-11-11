const API = process.env.API_URL ?? 'http://localhost:8787';

/**
 * Sign in without a browser form: the API exposes a dev-only session endpoint
 * (disabled in production), then the payload is written straight into the
 * persisted auth store so the SPA boots as an authenticated user.
 */
export async function devLogin(page, { base, email = 'anna@kanban.local' } = {}) {
  const response = await fetch(`${API}/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error(`dev-login -> ${response.status}`);
  const payload = await response.json();

  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((session) => {
    localStorage.setItem('kanban.session', JSON.stringify({ state: session, version: 1 }));
  }, payload);
  await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
  return payload;
}
