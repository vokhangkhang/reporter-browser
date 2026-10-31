import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, localPath, validateConfig } from './lib/config.mjs';
import { buildReport } from './lib/report.mjs';

const read = async name => JSON.parse(await readFile(resolve(root, name), 'utf8'));
const config = validateConfig(await read('reporter.config.example.json'));
const result = buildReport(config, await read('examples/pm.snapshot.json'), await read('examples/slack.snapshot.json'), await read('examples/drive.snapshot.json'));
await mkdir(localPath('.local/demo'), { recursive: true });
await writeFile(localPath('.local/demo/report.md'), result.markdown);
await writeFile(localPath('.local/demo/report.json'), JSON.stringify(result.summary, null, 2));
console.log('Demo with fictional data only: .local/demo/report.md');
console.log(JSON.stringify(result.summary, null, 2));
