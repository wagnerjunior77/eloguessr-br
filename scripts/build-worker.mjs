import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const assets = {};
for (const entry of await readdir('dist', { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const type = mime[extname(entry.name)];
  if (!type) throw new Error(`Unknown asset type: ${entry.name}`);
  assets[`/${entry.name}`] = { type, body: await readFile(join('dist', entry.name), 'utf8') };
}
if (!assets['/index.html']) throw new Error('Missing dist/index.html');
const source = await readFile('worker/index.js', 'utf8');
if (!source.includes('__ELOGUESSR_ASSETS__')) throw new Error('Missing assets placeholder');
await mkdir('dist/server', { recursive: true });
await writeFile('dist/server/index.js', source.replace('__ELOGUESSR_ASSETS__', JSON.stringify(assets)));
