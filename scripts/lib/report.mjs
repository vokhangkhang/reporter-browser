const esc = value => String(value ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').replace(/[<>`\[\]]/g, '');
const fmt = value => value === null ? 'Chưa điền' : String(value);
const refValid = value => typeof value === 'string' && /^#\d+$/.test(value);
const knownNumber = value => value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);

export function totals(tasks, doneStatuses) {
  const done = tasks.filter(t => doneStatuses.includes(t.status));
  return {
    taskCount: tasks.length,
    knownPoint: tasks.reduce((sum, t) => sum + (t.point ?? 0), 0),
    missingPoint: tasks.filter(t => t.point === null).length,
    doneTasks: done.length,
    donePoint: done.reduce((sum, t) => sum + (t.point ?? 0), 0),
    doneMissingPoint: done.filter(t => t.point === null).length,
  };
}

function validateScope(config, data, name, monthly = false) {
  if (!data || data.project !== config.pm.project || data.origin !== new URL(config.pm.origin).origin || data.assignee !== config.pm.assignee || !data.collectedAt || Number.isNaN(Date.parse(data.collectedAt))) throw new Error(`${name}: snapshot scope or collectedAt does not match config. Recollect for this scope.`);
  if (monthly && data.period !== config.report.period) throw new Error(`${name}: period does not match config.`);
}

export function buildReport(config, pm, slack = null, drive = null) {
  validateScope(config, pm, 'PM');
  if (pm.complete !== true || !Array.isArray(pm.tasks) || !Array.isArray(pm.sprints) || (pm.errors?.length ?? 0) > 0) throw new Error('PM collection is incomplete. Refusing totals.');
  if (pm.pointField !== config.pm.pointField) throw new Error('PM point field does not match config.');
  const slugs = config.pm.sprints.map(s => s.slug);
  if (pm.sprints.length !== slugs.length || new Set(pm.sprints.map(s => s.slug)).size !== slugs.length || pm.sprints.some(s => !slugs.includes(s.slug))) throw new Error('PM sprint scope does not match config.');
  const refs = new Set();
  for (const task of pm.tasks) {
    if (!refValid(task.ref) || refs.has(task.ref) || !knownNumber(task.point) || !slugs.includes(task.sprint) || typeof task.status !== 'string' || !task.status.trim()) throw new Error('PM contains duplicate refs, invalid points, sprint or status.');
    refs.add(task.ref);
  }
  const expected = [];
  for (const sprint of pm.sprints) {
    if (!Array.isArray(sprint.cards) || !Array.isArray(sprint.mine) || !Number.isInteger(sprint.openTasks) || !Number.isInteger(sprint.closedTasks) || sprint.openTasks < 0 || sprint.closedTasks < 0 || sprint.cards.length !== sprint.openTasks + sprint.closedTasks) throw new Error('PM board counts are incomplete.');
    if (new Set(sprint.cards.map(t => t.ref)).size !== sprint.cards.length || sprint.cards.some(t => !refValid(t.ref) || !Array.isArray(t.assignees))) throw new Error('PM board contains invalid or duplicate cards.');
    const selected = sprint.cards.filter(t => config.pm.assignee === null || t.assignees.includes(config.pm.assignee));
    if (JSON.stringify(selected.map(t => t.ref).sort()) !== JSON.stringify(sprint.mine.map(t => t.ref).sort())) throw new Error('PM assignee selection is inconsistent.');
    for (const task of selected) {
      expected.push(task.ref);
      const detail = pm.tasks.find(t => t.ref === task.ref && t.sprint === sprint.slug);
      if (!detail || task.status !== detail.status) throw new Error('PM card and task details differ or are missing.');
    }
  }
  if (expected.length !== refs.size || new Set(expected).size !== expected.length) throw new Error('PM task coverage is inconsistent.');

  let entries = null, driveRefs = null;
  if (slack !== null) {
    validateScope(config, slack, 'Slack', true);
    if (slack.complete !== true || !Array.isArray(slack.entries)) throw new Error('Slack snapshot must be complete with entries.');
    const keys = new Set();
    for (const entry of slack.entries) {
      const date = new Date(entry.date + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== entry.date || !refValid(entry.ref) || !knownNumber(entry.hours) || typeof entry.workKey !== 'string' || !entry.workKey.trim() || keys.has(entry.workKey)) throw new Error('Slack entries require real ISO dates, #refs, hours or null, and unique workKey after deduplication.');
      keys.add(entry.workKey);
      if (!/^https:\/\//.test(entry.sourceUrl || '')) throw new Error('Each Slack entry requires a sourceUrl.');
    }
    entries = slack.entries.filter(e => e.date.startsWith(config.report.period + '-'));
  }
  if (drive !== null) {
    validateScope(config, drive, 'Drive', true);
    if (drive.complete !== true || !Array.isArray(drive.taskRefs) || drive.taskRefs.some(r => !refValid(r)) || new Set(drive.taskRefs).size !== drive.taskRefs.length) throw new Error('Drive requires complete:true and unique #taskRefs.');
    driveRefs = new Set(drive.taskRefs);
  }
  const tasks = [...pm.tasks].sort((a, b) => slugs.indexOf(a.sprint) - slugs.indexOf(b.sprint) || Number(a.ref.slice(1)) - Number(b.ref.slice(1)));
  const slackRefs = entries === null ? null : new Set(entries.map(e => e.ref));
  const scoped = slackRefs === null ? null : tasks.filter(t => slackRefs.has(t.ref));
  const scope = { origin: pm.origin, project: pm.project, assignee: pm.assignee, period: config.report.period };
  const summary = { scope, collectedAt: pm.collectedAt, allSprints: totals(tasks, config.pm.doneStatuses),
    dailyReferenced: scoped === null ? null : totals(scoped, config.pm.doneStatuses),
    missingPmRefs: slackRefs === null ? null : [...slackRefs].filter(ref => !refs.has(ref)),
    missingDriveRefs: slackRefs === null || driveRefs === null ? null : [...slackRefs].filter(ref => !driveRefs.has(ref)),
    slackHours: entries === null ? null : { knownHours: entries.reduce((sum, e) => sum + (e.hours ?? 0), 0), unknownEntries: entries.filter(e => e.hours === null).length },
  };
  let markdown = `# Báo cáo PM — ${esc(pm.project)} — ${config.report.period}\n\nPhạm vi: ${esc(pm.assignee ?? 'Toàn dự án trong các sprint đã chọn')}. Snapshot PM: ${pm.collectedAt}.\n\n`;
  markdown += '## Tổng các sprint theo assignee hiện tại\n\n| Sprint | Task | Point đã điền | Task thiếu point | Done | Point Done đã điền | Done thiếu point |\n|---|---:|---:|---:|---:|---:|---:|\n';
  for (const sprint of config.pm.sprints) {
    const t = totals(tasks.filter(t => t.sprint === sprint.slug), config.pm.doneStatuses);
    markdown += `| ${esc(sprint.name)} | ${t.taskCount} | ${t.knownPoint} | ${t.missingPoint} | ${t.doneTasks} | ${t.donePoint} | ${t.doneMissingPoint} |\n`;
  }
  markdown += `\nTổng: ${summary.allSprints.taskCount} task; ${summary.allSprints.knownPoint} point đã điền; ${summary.allSprints.missingPoint} task chưa điền point.\n\n`;
  markdown += 'Đây là trạng thái hiện tại của các sprint được chọn, chưa chứng minh ngày hoàn thành hoặc đóng góp cá nhân trong kỳ. Point là custom field cấu hình, không quy đổi sang giờ. Giá trị thiếu giữ là chưa biết. Chỉ trạng thái khớp chính xác doneStatuses được tính Done.\n\n';
  markdown += '## Đối chiếu daily trong kỳ\n\n';
  if (scoped === null) markdown += 'Chưa cung cấp snapshot Slack; chưa đối chiếu daily.\n\n';
  else {
    markdown += `Nguồn Slack lấy lúc ${slack.collectedAt}. ${slackRefs.size} task được daily nhắc đến trong kỳ; tìm thấy ${scoped.length} trong phạm vi PM. Có ${summary.dailyReferenced.knownPoint} point đã điền, ${summary.dailyReferenced.missingPoint} task thiếu point. Đây là point của task được nhắc đến, chưa phải point hoàn thành trong kỳ.\n\nGiờ daily đọc rõ: ${summary.slackHours.knownHours}; ${summary.slackHours.unknownEntries} dòng chưa rõ giờ. Không thay giờ daily bằng Spent Time cộng dồn trên PM.\n\nTask chưa tìm thấy trong phạm vi PM: ${summary.missingPmRefs.join(', ') || 'Không có'}.\n\n`;
    markdown += driveRefs === null ? 'Chưa cung cấp snapshot Drive; chưa đối chiếu tệp báo cáo.\n\n' : `Nguồn Drive lấy lúc ${drive.collectedAt}. Task daily chưa có trong snapshot Drive: ${summary.missingDriveRefs.join(', ') || 'Không có'}.\n\n`;
    markdown += 'Nguồn daily đã sử dụng:\n\n' + [...new Set(entries.map(e => e.sourceUrl))].map(url => `- <${new URL(url).href}>`).join('\n') + '\n\n';
  }
  markdown += '## Chi tiết PM\n\n| Task | Sprint | Nội dung | Trạng thái | Point | Có trong daily kỳ này |\n|---|---|---|---|---:|---|\n';
  for (const task of tasks) {
    const url = `${pm.origin}/project/${pm.project}/task/${task.ref.slice(1)}`;
    markdown += `| [${task.ref}](${url}) | ${esc(task.sprint)} | ${esc(task.subject)} | ${esc(task.status)} | ${fmt(task.point)} | ${slackRefs === null ? 'Chưa đối chiếu' : slackRefs.has(task.ref) ? 'Có' : 'Chưa thấy'} |\n`;
  }
  markdown += '\n## Giới hạn\n\nKhông gồm task ngoài các sprint đã chọn, task bị xóa hoặc lịch sử thay đổi người phụ trách. Snapshot có thể cũ; kiểm tra collectedAt trước khi dùng. complete:true chỉ xác nhận phạm vi snapshot, không xác nhận toàn bộ dự án hoặc ngày hoàn thành. Slack/Drive do người dùng hoặc Codex chuẩn hóa theo docs/snapshots.md; script này không tự kết nối hai dịch vụ đó và không ghi lên PM/Drive.\n';
  return { summary, markdown };
}
