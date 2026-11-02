import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { loadConfig, localEndpoint } from './lib/config.mjs';
const config = await loadConfig();

const root = fileURLToPath(new URL('../', import.meta.url));
const executablePath = config.chrome.executablePath;
const personalRoot = join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
const automationRoot = resolve(root, '.local', 'chrome-automation');
const mode = process.argv[2] || 'check';
const keepOpen = process.argv.includes('--keep-open');
const pmUrl = config.pm.origin;
let connected = false;

function chromeVersion() {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `(Get-Item -LiteralPath '${executablePath.replaceAll("'", "''")}').VersionInfo.ProductVersion`],
  { encoding: 'utf8', windowsHide: true }).trim();
}

async function discoverEndpoint() {
  if (mode === 'check') return { endpoint: config.chrome.cdpUrl, source: 'config.chrome.cdpUrl' };
  if (process.env.CHROME_CDP_URL) {
    return { endpoint: localEndpoint(process.env.CHROME_CDP_URL), source: 'CHROME_CDP_URL' };
  }
  // Only read Chrome's debugging endpoint file, never cookies or profile stores.
  try {
    const lines = (await readFile(join(personalRoot, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
    const port = Number(lines[0]);
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^\/devtools\/browser\/[\w-]+$/.test(lines[1])) {
      throw new Error('Invalid DevToolsActivePort file.');
    }
    return { endpoint: `ws://127.0.0.1:${port}${lines[1]}`, source: 'DevToolsActivePort' };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const response = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error(`CDP discovery returned HTTP ${response.status}`);
  const info = await response.json();
  return { endpoint: localEndpoint(info.webSocketDebuggerUrl), source: 'localhost:9222' };
}

async function saveResult(result) {
  await mkdir(resolve(root, '.local'), { recursive: true });
  await writeFile(resolve(root, '.local', 'last-chrome-check.json'), JSON.stringify(result, null, 2) + '\n');
  await writeFile(resolve(root, '.local', `chrome-${mode}-result.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}

async function readPm(context) {
  // A new tab only: never navigate, close or modify any pre-existing tab.
  const page = await context.newPage();
  const response = await page.goto(pmUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Allow the SPA to render its title without waiting for long-lived network connections.
  await page.waitForFunction(() => document.title.trim().length > 0, undefined, { timeout: 10000 });
  return { page, result: { requestedUrl: pmUrl, finalUrl: page.url(), title: await page.title(), httpStatus: response?.status() ?? null } };
}

async function run() {
  if (!['check', 'personal', 'automation'].includes(mode)) throw new Error('Usage: node scripts/chrome.mjs check|personal|automation [--keep-open]');
  const base = { checkedAt: new Date().toISOString(), chromeVersion: chromeVersion(), mode };
  if (mode === 'check' || mode === 'personal') {
    let connection;
    try { connection = await discoverEndpoint(); }
    catch (error) {
      await saveResult({ ...base, connected: false, error: error.cause?.code || error.message,
        nextStep: 'For a personal connection open chrome://inspect/#remote-debugging and enable it; allow the Chrome prompt when connecting. For automation run npm.cmd run chrome:start. No restart is required.' });
      process.exitCode = 1;
      return;
    }
    const browser = await chromium.connectOverCDP(connection.endpoint, { timeout: 20000 });
    connected = true;
    try {
      const context = browser.contexts()[0];
      if (!context) throw new Error('CDP connection has no browser context.');
      const result = { ...base, connected: true, endpointSource: connection.source, browserVersion: browser.version() };
      if (mode === 'personal') Object.assign(result, (await readPm(context)).result);
      await saveResult(result);
    } finally {
      // On an attached browser this disconnects Playwright; it does not terminate Chrome.
      await browser.close();
    }
    return;
  }
  await mkdir(automationRoot, { recursive: true });
  const context = await chromium.launchPersistentContext(automationRoot, {
    executablePath, headless: false, viewport: null,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  connected = true;
  try {
    const { result } = await readPm(context);
    await saveResult({ ...base, connected: true, profilePath: automationRoot, ...result });
    if (keepOpen) {
      console.log('Sign in to PM in the automation window. Press Enter here when finished to save the session and close ONLY this automation browser.');
      const terminal = createInterface({ input: process.stdin, output: process.stdout });
      try { await terminal.question(''); } finally { terminal.close(); }
    }
  } finally {
    // This context belongs solely to the separate automation profile.
    await context.close();
  }
}

run().catch(async error => {
  await saveResult({ checkedAt: new Date().toISOString(), mode, connected, verifiedPmTitle: false,
    error: error.message, ...(mode === 'automation' ? { profilePath: automationRoot } : {})
  }).catch(() => {});
  console.error(`Chrome connection failed: ${error.message}`);
  console.error('No personal Chrome process was closed. If the automation profile is already open, close only its window before retrying.');
  process.exitCode = 1;
});
