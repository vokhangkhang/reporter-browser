import { access } from 'node:fs/promises';
import { chromium } from 'playwright';
import { loadConfig, localPath } from './lib/config.mjs';

try {
  if (process.platform !== 'win32') throw new Error('This release supports Windows + installed Google Chrome.');
  const config = await loadConfig();
  await access(config.chrome.executablePath);
  if (new URL(config.pm.origin).hostname.endsWith('example.com')) throw new Error('Replace pm.example.com with your PM origin.');
  const result = { node: process.version, config: 'valid', chromeExecutable: 'found',
    profile: localPath(config.chrome.profilePath), project: config.pm.project,
    sprints: config.pm.sprints.map(s => s.slug), scope: config.pm.assignee ?? 'all assignees',
    slack: 'Check connector access in your Codex session; not tested by this command.',
    drive: 'Check connector access in your Codex session; not tested by this command.' };
  if (process.argv.includes('--connect')) {
    const browser = await chromium.connectOverCDP(config.chrome.cdpUrl, { timeout: 10000 });
    try { result.cdp = 'connected'; result.browserVersion = browser.version(); }
    finally { await browser.close(); }
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`Doctor failed: ${error.message}`);
  process.exitCode = 1;
}
