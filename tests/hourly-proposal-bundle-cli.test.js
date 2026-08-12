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

import {
  canonicalJson,
  sha256Hex,
} from '../scripts/hourly-proposal-bundle.mjs';

const cliPath = new URL('../scripts/hourly-proposal-bundle.mjs', import.meta.url)
  .pathname;
const repositoryFullName = 'ContextualWisdomLab/DiagramWeave';

function runProcess(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
}

function runRequired(command, args, options = {}) {
  const result = runProcess(command, args, options);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function runCli(args, options = {}) {
  return runProcess(process.execPath, [cliPath, ...args], options);
}

async function createRepositoryFixture() {
  const root = await mkdtemp(join(tmpdir(), 'diagramweave-proposal-cli-'));
  const source = join(root, 'source');
  const target = join(root, 'target');
  const bundleDirectory = join(root, 'bundle');
  await mkdir(source);
  await writeFile(join(source, 'tracked.txt'), 'baseline\n', 'utf8');
  runRequired('git', ['init', '--quiet'], { cwd: source });
  runRequired('git', ['config', 'user.name', 'CLI Test'], { cwd: source });
  runRequired('git', ['config', 'user.email', 'cli@example.invalid'], {
    cwd: source,
  });
  runRequired('git', ['add', 'tracked.txt'], { cwd: source });
  runRequired('git', ['commit', '--quiet', '-m', 'baseline'], { cwd: source });
  const baseCommitSha = runRequired('git', ['rev-parse', 'HEAD'], {
    cwd: source,
  });
  await writeFile(join(source, 'tracked.txt'), 'changed\n', 'utf8');
  await writeFile(join(source, 'new.txt'), 'new\n', 'utf8');
  return {
    baseCommitSha,
    bundleDirectory,
    root,
    source,
    target,
  };
}

function expectedArguments(fixture) {
  return [
    '--repository',
    repositoryFullName,
    '--base-sha',
    fixture.baseCommitSha,
    '--execution-mode',
    'product',
  ];
}

test('CLI builds validates hashes and materializes one exact proposal', async () => {
  const fixture = await createRepositoryFixture();
  try {
    const build = runCli([
      'build',
      ...expectedArguments(fixture),
      '--workspace',
      fixture.source,
      '--output',
      fixture.bundleDirectory,
    ]);
    assert.equal(
      build.status,
      0,
      `build failed\nstdout:\n${build.stdout}\nstderr:\n${build.stderr}`,
    );
    const buildReceipt = JSON.parse(build.stdout);
    assert.match(buildReceipt.manifestSha256, /^[0-9a-f]{64}$/);
    assert.equal(buildReceipt.totalFileCount, 2);

    const validate = runCli([
      'validate',
      ...expectedArguments(fixture),
      '--bundle',
      fixture.bundleDirectory,
    ]);
    assert.equal(
      validate.status,
      0,
      `validate failed\nstdout:\n${validate.stdout}\nstderr:\n${validate.stderr}`,
    );
    const manifest = JSON.parse(validate.stdout);
    assert.equal(manifest.base_commit_sha, fixture.baseCommitSha);
    assert.deepEqual(
      manifest.files.map(({ kind, path }) => ({ kind, path })),
      [
        { kind: 'file', path: 'new.txt' },
        { kind: 'file', path: 'tracked.txt' },
      ],
    );

    runRequired(
      'git',
      ['clone', '--quiet', '--no-hardlinks', fixture.source, fixture.target],
    );
    runRequired(
      'git',
      ['checkout', '--quiet', '--detach', fixture.baseCommitSha],
      { cwd: fixture.target },
    );
    const materialize = runCli([
      'materialize',
      ...expectedArguments(fixture),
      '--bundle',
      fixture.bundleDirectory,
      '--workspace',
      fixture.target,
    ]);
    assert.equal(
      materialize.status,
      0,
      `materialize failed\nstdout:\n${materialize.stdout}\nstderr:\n${materialize.stderr}`,
    );
    assert.equal(await readFile(join(fixture.target, 'tracked.txt'), 'utf8'), 'changed\n');
    assert.equal(await readFile(join(fixture.target, 'new.txt'), 'utf8'), 'new\n');

    const sourceHash = runCli(['hash-tree', '--workspace', fixture.source]);
    const targetHash = runCli(['hash-tree', '--workspace', fixture.target]);
    assert.equal(sourceHash.status, 0);
    assert.equal(targetHash.status, 0);
    assert.match(sourceHash.stdout.trim(), /^[0-9a-f]{64}$/);
    assert.equal(sourceHash.stdout.trim(), targetHash.stdout.trim());
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('CLI validates a bound verification receipt and expected evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'diagramweave-receipt-cli-'));
  try {
    const receiptPath = join(root, 'verification-receipt.json');
    const receipt = {
      base_commit_sha: '1'.repeat(40),
      proposal_artifact_digest: `sha256:${'a'.repeat(64)}`,
      proposal_manifest_sha256: 'b'.repeat(64),
      schema_version: '1.0.0',
      source_unchanged_during_verification: true,
      verification_commands: [
        'npm ci --ignore-scripts --no-audit --no-fund',
        'npm run verify',
        'node scripts/check-package-contents.mjs',
      ],
      verification_commit_sha: '2'.repeat(40),
      verified_source_tree_sha256: 'c'.repeat(64),
    };
    await writeFile(receiptPath, canonicalJson(receipt), 'utf8');

    const result = runCli([
      'verify-receipt',
      '--receipt',
      receiptPath,
      '--artifact-digest',
      receipt.proposal_artifact_digest,
      '--manifest-sha256',
      receipt.proposal_manifest_sha256,
      '--base-sha',
      receipt.base_commit_sha,
      '--tree-sha256',
      receipt.verified_source_tree_sha256,
    ]);
    assert.equal(
      result.status,
      0,
      `verify-receipt failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
    assert.deepEqual(JSON.parse(result.stdout), receipt);

    const mismatch = runCli([
      'verify-receipt',
      '--receipt',
      receiptPath,
      '--artifact-digest',
      `sha256:${'d'.repeat(64)}`,
    ]);
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /verification_receipt_mismatch:proposal_artifact_digest/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test('CLI resolves forbidden literals only from explicitly named environment values', async () => {
  const fixture = await createRepositoryFixture();
  const secretValue = 'nvidia-secret-must-not-cross';
  try {
    await writeFile(join(fixture.source, 'tracked.txt'), `${secretValue}\n`, 'utf8');
    const result = runCli(
      [
        'build',
        ...expectedArguments(fixture),
        '--workspace',
        fixture.source,
        '--output',
        fixture.bundleDirectory,
        '--forbid-literal-env',
        'TEST_NVIDIA_SECRET',
      ],
      {
        env: {
          ...process.env,
          TEST_NVIDIA_SECRET: secretValue,
        },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /proposal_bundle_invalid:forbidden_literal/);
    assert.doesNotMatch(result.stderr, new RegExp(secretValue));
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('CLI rejects unknown duplicate missing and ambient arguments with fixed errors', async () => {
  const cases = [
    {
      args: ['unknown'],
      error: 'hourly_proposal_cli_invalid:command',
    },
    {
      args: ['hash-tree'],
      error: 'hourly_proposal_cli_invalid:missing_option:workspace',
    },
    {
      args: ['hash-tree', '--workspace', '.', '--workspace', '.'],
      error: 'hourly_proposal_cli_invalid:duplicate_option:workspace',
    },
    {
      args: ['hash-tree', '--unknown', '.'],
      error: 'hourly_proposal_cli_invalid:unknown_option:unknown',
    },
  ];
  for (const testCase of cases) {
    const result = runCli(testCase.args);
    assert.equal(result.status, 1, JSON.stringify(testCase));
    assert.match(result.stderr, new RegExp(testCase.error));
  }
});

test('receipt bytes are canonical and bound to their own digest', async () => {
  const receipt = {
    base_commit_sha: '1'.repeat(40),
    proposal_artifact_digest: `sha256:${'a'.repeat(64)}`,
    proposal_manifest_sha256: 'b'.repeat(64),
    schema_version: '1.0.0',
    source_unchanged_during_verification: true,
    verification_commands: [
      'npm ci --ignore-scripts --no-audit --no-fund',
      'npm run verify',
      'node scripts/check-package-contents.mjs',
    ],
    verification_commit_sha: '2'.repeat(40),
    verified_source_tree_sha256: 'c'.repeat(64),
  };
  assert.equal(
    sha256Hex(canonicalJson(receipt)),
    sha256Hex(Buffer.from(canonicalJson(receipt), 'utf8')),
  );
});
