import { gunzipSync } from 'node:zlib';
import { readFile, rm, unlink, writeFile } from 'node:fs/promises';

const chunks = [];
for (let index = 0; index < 9; index += 1) {
  const suffix = String(index).padStart(2, '0');
  chunks.push(await readFile(`.bootstrap/cli-payload-${suffix}.txt`, 'utf8'));
}

const temporary = 'scripts/.apply-cli-foundation.decoded.mjs';
await writeFile(temporary, gunzipSync(Buffer.from(chunks.join(''), 'base64')));
try {
  await import(new URL(`../${temporary}`, import.meta.url));
} finally {
  await unlink(temporary).catch(() => undefined);
  await rm('.bootstrap', { recursive: true, force: true });
}
