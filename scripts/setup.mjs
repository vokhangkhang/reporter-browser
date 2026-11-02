import { copyFile, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './lib/config.mjs';

try {
  await copyFile(resolve(root, 'reporter.config.example.json'), resolve(root, 'reporter.config.local.json'), constants.COPYFILE_EXCL);
  console.log('Created reporter.config.local.json. Edit PM, sprints, assignee, period and source links before running.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('reporter.config.local.json already exists; kept unchanged.');
}
