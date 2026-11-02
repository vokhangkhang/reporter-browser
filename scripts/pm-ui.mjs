import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadConfig, localPath } from './lib/config.mjs';

let browser, page;
try {
  const config = await loadConfig();
  browser = await chromium.connectOverCDP(config.chrome.cdpUrl, { timeout: 20000 });
  const context = browser.contexts()[0];
  if (!context) throw new Error('Chrome has no browser context.');
  page = await context.newPage();
  const response = await page.goto(config.pm.origin, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.title.trim().length > 0, undefined, { timeout: 10000 });
  const result = { checkedAt: new Date().toISOString(), requestedUrl: config.pm.origin,
    finalUrl: page.url(), title: await page.title(), httpStatus: response?.status() ?? null };
  await mkdir(localPath('.local/results'), { recursive: true });
  await writeFile(localPath('.local/results/pm-ui.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log('A title check does not confirm login or access to the project.');
  if (!response?.ok()) process.exitCode = 1;
} catch (error) {
  console.error(`PM check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await page?.close().catch(() => {});
  await browser?.close();
}
