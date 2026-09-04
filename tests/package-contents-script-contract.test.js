import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

test('CI runs exact workspace package dry runs after repository verification', async () => {
  const scriptPath = new URL('../scripts/check-package-contents.mjs', import.meta.url);
  const scriptStat = await stat(scriptPath);
  assert.equal(scriptStat.isFile(), true);

  const workflow = await readFile(
    new URL('../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /- name: Verify package contents\n\s+run: node scripts\/check-package-contents\.mjs/u);
  assert.match(
    workflow,
    /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.repository \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.run_id \}\}/u,
  );
  assert.match(workflow, /cancel-in-progress: true/u);

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
