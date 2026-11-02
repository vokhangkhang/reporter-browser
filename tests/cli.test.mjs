import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root } from '../scripts/lib/config.mjs';

test('new-user CLI creates a report without any real account or old snapshot', async () => {
  const folder = `.local/cli-test-${process.pid}-${Date.now()}`;
  await mkdir(resolve(root, folder), { recursive: true });
  const config = JSON.parse(await readFile(resolve(root, 'reporter.config.example.json'), 'utf8'));
  for (const source of ['pm', 'slack', 'drive']) {
    const target = `${folder}/${source}.json`;
    await writeFile(resolve(root, target), await readFile(resolve(root, `examples/${source}.snapshot.json`)));
    config.report[`${source}Snapshot`] = target;
  }
  config.report.output = `${folder}/report.md`;
  const configPath = resolve(root, folder, 'config.json');
  await writeFile(configPath, JSON.stringify(config));
  const run = script => spawnSync(process.execPath, [resolve(root, 'scripts', script)], { cwd: root, encoding: 'utf8', env: { ...process.env, REPORTER_CONFIG: configPath } });
  const report = run('pm-report-sprints.mjs');
  assert.equal(report.status, 0, report.stderr || report.error?.message);
  const output = JSON.parse(await readFile(resolve(root, config.report.output + '.json'), 'utf8'));
  assert.equal(output.allSprints.knownPoint, 2);
  assert.deepEqual(output.missingDriveRefs, ['#2']);
  // Missing configured sources must fail, never silently produce unchecked totals.
  config.report.slackSnapshot = `${folder}/missing.json`;
  await writeFile(configPath, JSON.stringify(config));
  assert.equal(run('pm-report-sprints.mjs').status, 1);
});
