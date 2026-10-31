import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildReport } from '../scripts/lib/report.mjs';
import { validateConfig, localEndpoint, localPath } from '../scripts/lib/config.mjs';

const read = async path => JSON.parse(await readFile(new URL('../' + path, import.meta.url), 'utf8'));
const config = await read('reporter.config.example.json');
const pm = await read('examples/pm.snapshot.json');
const slack = await read('examples/slack.snapshot.json');
const drive = await read('examples/drive.snapshot.json');
const clone = value => structuredClone(value);

test('missing point differs from zero, only exact Done counts, boundaries excluded', () => {
  const result = buildReport(config, pm, slack, drive);
  assert.deepEqual(result.summary.allSprints, { taskCount: 3, knownPoint: 2, missingPoint: 1, doneTasks: 2, donePoint: 2, doneMissingPoint: 0 });
  assert.equal(result.summary.dailyReferenced.taskCount, 2);
  assert.deepEqual(result.summary.slackHours, { knownHours: 1.5, unknownEntries: 1 });
  assert.deepEqual(result.summary.missingDriveRefs, ['#2']);
  assert.match(result.markdown, /chưa phải point hoàn thành trong kỳ/);
});
test('Not Done never matches Done by substring', () => {
  const p = clone(pm);
  p.tasks[0].status = p.sprints[0].cards[0].status = p.sprints[0].mine[0].status = 'Not Done';
  assert.equal(buildReport(config, p).summary.allSprints.doneTasks, 1);
});
test('no snapshots means not checked, not zero work', () => {
  const result = buildReport(config, pm);
  assert.equal(result.summary.dailyReferenced, null);
  assert.equal(result.summary.slackHours, null);
  assert.match(result.markdown, /Chưa cung cấp snapshot Slack/);
});
test('incomplete collection rejects totals even if previous tasks exist', () => {
  const p = clone(pm); p.complete = false;
  assert.throws(() => buildReport(config, p), /incomplete/);
});
test('wrong project or assignee rejects a stale snapshot', () => {
  for (const key of ['project', 'assignee', 'origin']) {
    const p = clone(pm); p[key] = 'wrong';
    assert.throws(() => buildReport(config, p), /scope/);
  }
});
test('wrong sprint selection and point field reject stale data', () => {
  const p = clone(pm); p.sprints[0].slug = 'old-sprint';
  assert.throws(() => buildReport(config, p), /sprint scope/);
  const p2 = clone(pm); p2.pointField = 'Story points';
  assert.throws(() => buildReport(config, p2), /point field/);
});
test('missing detail, bad board counts, duplicate task refs reject totals', () => {
  const p = clone(pm); p.tasks.pop();
  assert.throws(() => buildReport(config, p), /missing/);
  const p2 = clone(pm); p2.sprints[0].openTasks++;
  assert.throws(() => buildReport(config, p2), /counts/);
  const p3 = clone(pm); p3.tasks.push(p3.tasks[0]);
  assert.throws(() => buildReport(config, p3), /duplicate/);
});
test('bad points reject totals rather than silently becoming zero', () => {
  for (const value of [undefined, -1, '2', Infinity]) {
    const p = clone(pm); p.tasks[0].point = value;
    assert.throws(() => buildReport(config, p), /invalid points/);
  }
});
test('repeated Yesterday entry with same workKey is rejected', () => {
  const s = clone(slack); s.entries.push(s.entries[0]);
  assert.throws(() => buildReport(config, pm, s), /unique workKey/);
});
test('bad daily date, missing hours and wrong report month reject data', () => {
  const s = clone(slack); s.entries[0].date = '2026-02-30';
  assert.throws(() => buildReport(config, pm, s), /real ISO dates/);
  const s2 = clone(slack); delete s2.entries[0].hours;
  assert.throws(() => buildReport(config, pm, s2), /hours/);
  const s3 = clone(slack); s3.period = '2026-09';
  assert.throws(() => buildReport(config, pm, s3), /period/);
});
test('daily task outside selected PM scope is listed, not discarded', () => {
  const s = clone(slack); s.entries[0].ref = '#999';
  assert.deepEqual(buildReport(config, pm, s).summary.missingPmRefs, ['#999']);
});
test('all-assignees scope includes every selected board task', () => {
  const c = clone(config); c.pm.assignee = null;
  const p = clone(pm); p.assignee = null;
  assert.equal(buildReport(c, p).summary.allSprints.taskCount, 3);
});
test('remote CDP and credential URLs are refused', () => {
  for (const url of ['http://example.com:9223', 'http://user:pass@localhost:9223', 'https://localhost:9223']) assert.throws(() => localEndpoint(url), /localhost/);
  assert.equal(localEndpoint('http://127.0.0.1:9223'), 'http://127.0.0.1:9223/');
});
test('private output cannot escape .local and profile cannot target personal data', () => {
  for (const path of ['reports/test.md', '.local/../README.md', '.local/']) assert.throws(() => localPath(path));
  const c = clone(config); c.chrome.profilePath = 'C:/Users/Demo/Chrome/User Data';
  assert.throws(() => validateConfig(c), /profilePath/);
  const c2 = clone(config); c2.report.period = '2026-13';
  assert.throws(() => validateConfig(c2), /YYYY-MM/);
});
