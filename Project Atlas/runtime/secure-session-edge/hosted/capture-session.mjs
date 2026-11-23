import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const [origin, playwrightModule, output, provider, tenant] = process.argv.slice(2);
const url = new URL(origin);
assert.equal(url.origin, origin);
assert.equal(url.protocol, 'https:');
assert.equal(process.env.MOS140C_ACCEPTANCE_HOST, url.hostname);
assert(['GOOGLE', 'MICROSOFT'].includes(provider));
assert(['ACCEPTANCE-A', 'ACCEPTANCE-B'].includes(tenant));
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const browser = await chromium.launch({ headless: false });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin + '/ready');
  const authorizationUrl = await page.evaluate(async (provider) => {
    const response = await fetch('/auth/start', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, intendedRoute: 'tooling' }) });
    if (!response.ok) throw new Error('Acceptance sign-in could not start');
    return (await response.json()).authorizationUrl;
  }, provider);
  assert.equal(new URL(authorizationUrl).protocol, 'https:');
  const callback = page.waitForURL((value) => value.origin === origin && value.pathname === '/auth/callback',
    { timeout: 180_000, waitUntil: 'load' });
  await page.goto(authorizationUrl);
  await callback;
  const response = await context.request.get(origin + '/session/status');
  assert.equal(response.status(), 200);
  assert.equal((await response.json()).activeTenant, tenant);
  await writeFile(output, JSON.stringify(await context.storageState()), { mode: 0o600, flag: 'wx' });
  console.log('Short-lived acceptance session captured. Keep private and delete after use.');
} finally {
  await browser.close();
}
