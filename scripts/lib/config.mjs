import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));

export function localPath(value) {
  if (typeof value !== 'string' || !value.startsWith('.local/')) throw new Error('Private paths must start with .local/.');
  const path = resolve(root, value);
  const rel = relative(resolve(root, '.local'), path);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Private path must stay inside .local/.');
  return path;
}

export function localEndpoint(value) {
  const url = new URL(value);
  if (!['http:', 'ws:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new Error('CDP must use http:// or ws:// on localhost without credentials.');
  }
  return url.href;
}

export function validateConfig(config) {
  const { chrome, pm, report } = config;
  if (!chrome || !pm || !report) throw new Error('Config requires chrome, pm and report.');
  localEndpoint(chrome.cdpUrl);
  const endpoint = new URL(chrome.cdpUrl);
  if (endpoint.protocol !== 'http:' || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || !endpoint.port) throw new Error('chrome.cdpUrl must be http://127.0.0.1:PORT (or localhost).');
  if (typeof chrome.executablePath !== 'string' || !chrome.executablePath) throw new Error('Set chrome.executablePath.');
  // Dedicated fixed directory: configuration can never point at a personal profile.
  if (chrome.profilePath !== '.local/chrome-automation') throw new Error('chrome.profilePath must be .local/chrome-automation.');
  const origin = new URL(pm.origin);
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('pm.origin must be an HTTP(S) origin without credentials or path.');
  if (typeof pm.project !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(pm.project)) throw new Error('Set a valid pm.project slug.');
  if (!Array.isArray(pm.sprints) || !pm.sprints.length || new Set(pm.sprints.map(s => s.slug)).size !== pm.sprints.length || pm.sprints.some(s => !/^[a-zA-Z0-9_-]+$/.test(s.slug) || typeof s.name !== 'string' || !s.name.trim())) throw new Error('Set unique pm.sprints: [{slug, name}].');
  if (pm.assignee !== null && (typeof pm.assignee !== 'string' || !pm.assignee.trim())) throw new Error('pm.assignee must be an avatar name or null for all assignees.');
  if (typeof pm.pointField !== 'string' || !pm.pointField.trim() || !Array.isArray(pm.doneStatuses) || !pm.doneStatuses.length || pm.doneStatuses.some(s => typeof s !== 'string' || !s.trim())) throw new Error('Set pm.pointField and pm.doneStatuses.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(report.period)) throw new Error('report.period must be YYYY-MM.');
  for (const key of ['pmSnapshot', 'output']) localPath(report[key]);
  for (const key of ['slackSnapshot', 'driveSnapshot']) if (report[key] !== null) localPath(report[key]);
  const inputs = ['pmSnapshot', 'slackSnapshot', 'driveSnapshot'].map(key => report[key]).filter(value => value !== null).map(localPath);
  if (new Set(inputs).size !== inputs.length || inputs.includes(localPath(report.output)) || inputs.includes(localPath(report.output) + '.json')) throw new Error('Snapshot and output paths must be distinct.');
  return config;
}

export async function loadConfig() {
  const path = resolve(root, process.env.REPORTER_CONFIG || 'reporter.config.local.json');
  let config;
  try { config = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { throw new Error(`Cannot read config ${path}: ${error.message}. Run npm.cmd run setup.`); }
  return validateConfig(config);
}
