import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadConfig, localPath } from './lib/config.mjs';
import { buildReport } from './lib/report.mjs';

try {
  const config = await loadConfig();
  const read = async path => path === null ? null : JSON.parse(await readFile(localPath(path), 'utf8'));
  const result = buildReport(config, await read(config.report.pmSnapshot), await read(config.report.slackSnapshot), await read(config.report.driveSnapshot));
  const output = localPath(config.report.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, result.markdown, 'utf8');
  await writeFile(output + '.json', JSON.stringify(result.summary, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...result.summary }, null, 2));
} catch (error) {
  console.error(`Report failed: ${error.message}`);
  process.exitCode = 1;
}
