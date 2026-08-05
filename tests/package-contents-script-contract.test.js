import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

test('root verification runs exact workspace package dry runs', async () => {
  const scriptPath = new URL('../scripts/check-package-contents.mjs', import.meta.url);
  const scriptStat = await stat(scriptPath);
  assert.equal(scriptStat.isFile(), true);

  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.equal(
    packageJson.scripts['package-contents'],
    'node scripts/check-package-contents.mjs',
  );
  assert.match(packageJson.scripts.verify, /npm run package-contents$/u);

  const source = await readFile(scriptPath, 'utf8');
  assert.match(source, /npm pack/u);
  assert.match(source, /--dry-run/u);
  assert.match(source, /--json/u);
  assert.match(source, /packages\/language-server/u);
  assert.match(source, /packages\/language-server-stdio/u);
  assert.match(source, /package\/src\/completion-session\.js/u);
  assert.match(source, /package\/src\/completions\.js/u);
  assert.match(source, /package\/bin\/dweave-lsp\.js/u);
});
