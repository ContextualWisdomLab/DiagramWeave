import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const lowerSha256 = 'a'.repeat(64);
const secondSha256 = 'b'.repeat(64);
const baseCommitSha = '1'.repeat(40);

async function loadBundleModule() {
  try {
    return await import('../scripts/hourly-proposal-bundle.mjs');
  } catch (error) {
    assert.fail(
      `trusted hourly proposal bundle module must exist: ${error?.code ?? error}`,
    );
  }
}

async function readSchema(path, label) {
  try {
    return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
  } catch (error) {
    assert.fail(`${label} schema must exist and contain JSON: ${error?.code ?? error}`);
  }
}

function runRequired(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function validManifest(overrides = {}) {
  return {
    base_commit_sha: baseCommitSha,
    execution_mode: 'product',
    files: [
      {
        kind: 'file',
        mode: '0644',
        path: 'packages/core/src/example.js',
        sha256: lowerSha256,
        size_bytes: 12,
      },
    ],
    patch_sha256: secondSha256,
    repository_full_name: 'ContextualWisdomLab/DiagramWeave',
    schema_version: '1.0.0',
    total_file_count: 1,
    total_source_bytes: 12,
    ...overrides,
  };
}

function validReceipt(overrides = {}) {
  return {
    base_commit_sha: baseCommitSha,
    proposal_artifact_digest: `sha256:${lowerSha256}`,
    proposal_manifest_sha256: secondSha256,
    schema_version: '1.0.0',
    source_unchanged_during_verification: true,
    verification_commands: [
      'npm ci --ignore-scripts --no-audit --no-fund',
      'npm run verify',
      'node scripts/check-package-contents.mjs',
    ],
    verification_commit_sha: '2'.repeat(40),
    verified_source_tree_sha256: 'c'.repeat(64),
    ...overrides,
  };
}

test('trusted proposal module and versioned schemas expose the complete boundary', async () => {
  const bundle = await loadBundleModule();
  const proposalSchema = await readSchema(
    'schemas/hourly-proposal-manifest.schema.json',
    'proposal manifest',
  );
  const receiptSchema = await readSchema(
    'schemas/hourly-verification-receipt.schema.json',
    'verification receipt',
  );

  for (const exportName of [
    'buildProposalBundle',
    'canonicalJson',
    'hashSourceTree',
    'materializeProposalBundle',
    'sha256Hex',
    'validateProposalBundle',
    'validateProposalManifest',
    'validateVerificationReceipt',
  ]) {
    assert.equal(typeof bundle[exportName], 'function', `${exportName} must be exported`);
  }

  for (const schema of [proposalSchema, receiptSchema]) {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.type, 'object');
  }
  assert.deepEqual(
    proposalSchema.required.toSorted(),
    [
      'base_commit_sha',
      'execution_mode',
      'files',
      'patch_sha256',
      'repository_full_name',
      'schema_version',
      'total_file_count',
      'total_source_bytes',
    ].toSorted(),
  );
  assert.deepEqual(
    receiptSchema.required.toSorted(),
    [
      'base_commit_sha',
      'proposal_artifact_digest',
      'proposal_manifest_sha256',
      'schema_version',
      'source_unchanged_during_verification',
      'verification_commands',
      'verification_commit_sha',
      'verified_source_tree_sha256',
    ].toSorted(),
  );
});

test('manifest validation accepts one canonical proposal and rejects unsafe identities', async () => {
  const { validateProposalManifest } = await loadBundleModule();
  assert.deepEqual(validateProposalManifest(validManifest()), validManifest());

  const unsafeEntries = [
    { kind: 'file', mode: '0644', path: '../escape', sha256: lowerSha256, size_bytes: 1 },
    { kind: 'file', mode: '0644', path: '.git/config', sha256: lowerSha256, size_bytes: 1 },
    { kind: 'file', mode: '0644', path: '/absolute', sha256: lowerSha256, size_bytes: 1 },
    { kind: 'file', mode: '0644', path: 'a\\b', sha256: lowerSha256, size_bytes: 1 },
    { kind: 'file', mode: '0644', path: 'a//b', sha256: lowerSha256, size_bytes: 1 },
    { kind: 'file', mode: '0777', path: 'unsafe.sh', sha256: lowerSha256, size_bytes: 1 },
    { kind: 'symlink', mode: '120000', path: 'link', sha256: lowerSha256, size_bytes: 1 },
  ];
  for (const entry of unsafeEntries) {
    assert.throws(
      () => validateProposalManifest(validManifest({ files: [entry] })),
      /proposal_manifest_invalid/,
      JSON.stringify(entry),
    );
  }

  assert.throws(
    () =>
      validateProposalManifest(
        validManifest({
          files: [
            { kind: 'file', mode: '0644', path: 'z.txt', sha256: lowerSha256, size_bytes: 1 },
            { kind: 'file', mode: '0644', path: 'a.txt', sha256: secondSha256, size_bytes: 1 },
          ],
          total_file_count: 2,
          total_source_bytes: 2,
        }),
      ),
    /proposal_manifest_invalid:files_not_sorted/,
  );
  assert.throws(
    () => validateProposalManifest({ ...validManifest(), unexpected: true }),
    /proposal_manifest_invalid:unknown_property/,
  );
  assert.throws(
    () => validateProposalManifest(validManifest({ patch_sha256: lowerSha256.toUpperCase() })),
    /proposal_manifest_invalid:patch_sha256/,
  );
});

test('verification receipt validation binds immutable evidence and exact commands', async () => {
  const { validateVerificationReceipt } = await loadBundleModule();
  assert.deepEqual(validateVerificationReceipt(validReceipt()), validReceipt());
  assert.throws(
    () => validateVerificationReceipt(validReceipt({ source_unchanged_during_verification: false })),
    /verification_receipt_invalid:source_unchanged_during_verification/,
  );
  assert.throws(
    () => validateVerificationReceipt(validReceipt({ proposal_artifact_digest: lowerSha256 })),
    /verification_receipt_invalid:proposal_artifact_digest/,
  );
  assert.throws(
    () => validateVerificationReceipt({ ...validReceipt(), extra: 'unsafe' }),
    /verification_receipt_invalid:unknown_property/,
  );
});

test('canonical JSON and SHA-256 are deterministic and reject ambiguous values', async () => {
  const { canonicalJson, sha256Hex } = await loadBundleModule();
  assert.equal(
    canonicalJson({ z: [3, { b: 2, a: 1 }], a: 'value' }),
    '{"a":"value","z":[3,{"a":1,"b":2}]}\n',
  );
  assert.equal(
    sha256Hex('DiagramWeave'),
    '15881be609faa66654fdcb4c5ebac18821eca082d88a3d7cbb242a05312e113a',
  );
  assert.throws(() => canonicalJson({ value: Number.NaN }), /canonical_json_invalid/);
  assert.throws(() => canonicalJson({ value: undefined }), /canonical_json_invalid/);
});

test('a bounded proposal bundle round-trips tracked, deleted, and untracked files', async () => {
  const {
    buildProposalBundle,
    hashSourceTree,
    materializeProposalBundle,
    validateProposalBundle,
  } = await loadBundleModule();
  const root = await mkdtemp(join(tmpdir(), 'diagramweave-proposal-bundle-'));
  const source = join(root, 'source');
  const target = join(root, 'target');
  const bundleDirectory = join(root, 'bundle');

  try {
    await mkdir(source);
    await writeFile(join(source, 'tracked.txt'), 'baseline\n', 'utf8');
    await writeFile(join(source, 'deleted.txt'), 'remove me\n', 'utf8');
    runRequired('git', ['init', '--quiet'], { cwd: source });
    runRequired('git', ['config', 'user.name', 'Bundle Test'], { cwd: source });
    runRequired('git', ['config', 'user.email', 'bundle@example.invalid'], { cwd: source });
    runRequired('git', ['add', 'tracked.txt', 'deleted.txt'], { cwd: source });
    runRequired('git', ['commit', '--quiet', '-m', 'baseline'], { cwd: source });
    const exactBase = runRequired('git', ['rev-parse', 'HEAD'], { cwd: source });

    await writeFile(join(source, 'tracked.txt'), 'changed\n', 'utf8');
    await rm(join(source, 'deleted.txt'));
    await writeFile(join(source, 'new.txt'), 'new file\n', 'utf8');

    const buildReceipt = await buildProposalBundle({
      baseCommitSha: exactBase,
      executionMode: 'product',
      forbiddenLiteralValues: ['never-leak-this-secret'],
      outputDirectory: bundleDirectory,
      repositoryFullName: 'ContextualWisdomLab/DiagramWeave',
      workspacePath: source,
    });
    assert.match(buildReceipt.manifestSha256, /^[0-9a-f]{64}$/);
    const manifest = await validateProposalBundle({
      bundleDirectory,
      expectedBaseCommitSha: exactBase,
      expectedExecutionMode: 'product',
      expectedRepositoryFullName: 'ContextualWisdomLab/DiagramWeave',
    });
    assert.deepEqual(
      manifest.files.map(({ kind, path }) => ({ kind, path })),
      [
        { kind: 'deleted', path: 'deleted.txt' },
        { kind: 'file', path: 'new.txt' },
        { kind: 'file', path: 'tracked.txt' },
      ],
    );

    runRequired('git', ['clone', '--quiet', '--no-hardlinks', source, target]);
    runRequired('git', ['checkout', '--quiet', '--detach', exactBase], { cwd: target });
    await materializeProposalBundle({
      bundleDirectory,
      expectedBaseCommitSha: exactBase,
      expectedExecutionMode: 'product',
      expectedRepositoryFullName: 'ContextualWisdomLab/DiagramWeave',
      targetWorkspacePath: target,
    });

    assert.equal(await readFile(join(target, 'tracked.txt'), 'utf8'), 'changed\n');
    assert.equal(await readFile(join(target, 'new.txt'), 'utf8'), 'new file\n');
    await assert.rejects(readFile(join(target, 'deleted.txt')));
    assert.equal(
      await hashSourceTree({ workspacePath: source }),
      await hashSourceTree({ workspacePath: target }),
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
