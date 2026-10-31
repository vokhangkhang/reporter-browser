import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import {loadConfig,localPath} from './lib/config.mjs';
const config=await loadConfig();
const profile=localPath(config.chrome.profilePath);
await mkdir(profile,{recursive:true});
const child = spawn(config.chrome.executablePath, [
  `--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${new URL(config.chrome.cdpUrl).port}`, '--no-first-run', '--no-default-browser-check',
  config.pm.origin,
], {detached:true,stdio:'ignore',windowsHide:false});
child.on('error', error => { console.error(error.message); process.exitCode=1; });
child.unref();
console.log(`Requested Chrome automation window at ${config.chrome.cdpUrl}. Keep it open. If already open without debugging, close ONLY the automation window and run again.`);
