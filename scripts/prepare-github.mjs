import { readdir, readFile, mkdir, copyFile, lstat } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { root, localPath } from './lib/config.mjs';

// Export only reviewed source locations. Private data stays outside this list.
const topFiles = ['.gitignore', '.gitattributes', 'README.md', 'AGENTS.md', 'LICENSE', 'package.json', 'package-lock.json', 'reporter.config.example.json'];
const sourceDirs = ['scripts', 'docs', 'examples', 'tests', '.github'];
const files = [...topFiles];
async function walk(dir) {
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink: ${path}`);
    if (entry.isDirectory()) await walk(path);
    else files.push(path);
  }
}

try {
  for (const dir of sourceDirs) await walk(dir);
  let privateConfig;
  try { privateConfig = JSON.parse(await readFile(resolve(root, 'reporter.config.local.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const privateValues = [];
  for (const value of [privateConfig?.pm?.origin, privateConfig?.sources?.slackChannelUrl, privateConfig?.sources?.driveFolderUrl]) {
    if (value && !new URL(value).hostname.endsWith('example.com')) privateValues.push(new URL(value).hostname);
    if (value?.includes('/folders/')) privateValues.push(value.split('/folders/')[1].split(/[?#]/)[0]);
  }
  // Source examples deliberately use demo-project / demo.user.
  for (const value of [privateConfig?.pm?.assignee, privateConfig?.pm?.project, privateConfig?.sources?.slackUserId]) {
    if (value && !['demo-project', 'demo.user'].includes(value) && value.length >= 4) privateValues.push(value);
  }
  const secretPatterns = [ /xox[baprs]-[a-zA-Z0-9-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AIza[0-9A-Za-z_-]{30,}/, /gh[pousr]_[a-zA-Z0-9]{20,}/ ];
  for (const file of files) {
    if ((await lstat(resolve(root, file))).isSymbolicLink()) throw new Error(`Refusing symlink: ${file}`);
    if (!/\.(md|mjs|json|ya?ml)$/.test(file) && !topFiles.includes(file)) throw new Error(`Unexpected public file type: ${file}`);
    const text = await readFile(resolve(root, file), 'utf8');
    if (privateValues.some(value => text.toLowerCase().includes(value.toLowerCase())) || secretPatterns.some(pattern => pattern.test(text))) throw new Error(`Potential private data in ${file}; review before sharing.`);
  }
  files.sort();
  console.log(`Reviewed ${files.length} public files:\n${files.join('\n')}`);
  if (!process.argv.includes('--check')) {
    const index = process.argv.indexOf('--dest');
    const destination = localPath(index < 0 ? '.local/github-ready' : process.argv[index + 1]);
    // Refuse an existing destination rather than retain old unreviewed files.
    await mkdir(dirname(destination), { recursive: true });
    await mkdir(destination, { recursive: false });
    for (const file of files) {
      const target = resolve(destination, file);
      await mkdir(resolve(target, '..'), { recursive: true });
      await copyFile(resolve(root, file), target);
    }
    console.log(`Clean source copy: ${relative(root, destination)}. No account sessions or reports included.`);
  }
} catch (error) {
  console.error(`Prepare GitHub failed: ${error.message}`);
  process.exitCode = 1;
}
