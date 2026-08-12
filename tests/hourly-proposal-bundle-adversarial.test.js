import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  link,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildProposalBundle,
  canonicalJson,
  sha256Hex,
  validateProposalBundle,
} from '../scripts/hourly-proposal-bundle.mjs';

const repositoryFullName = 'ContextualWisdomLab/DiagramWeave';

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

async function createBundleFixture(content = 'changed\n') {
  const root = await mkdtemp(join(tmpdir(), 'diagramweave-proposal-adversarial-'));
  const source = join(root, 'source');
  const bundleDirectory = join(root, 'bundle');
  await mkdir(source);
  await writeFile(join(source, 'tracked.txt'), 'baseline\n', 'utf8');
  runRequired('git', ['init', '--quiet'], { cwd: source });
  runRequired('git', ['config', 'user.name', 'Adversarial Test'], {
    cwd: source,
  });
  runRequired('git', ['config', 'user.email', 'adversarial@example.invalid'], {
    cwd: source,
  });
  runRequired('git', ['add', 'tracked.txt'], { cwd: source });
  runRequired('git', ['commit', '--quiet', '-m', 'baseline'], { cwd: source });
  const baseCommitSha = runRequired('git', ['rev-parse', 'HEAD'], {
    cwd: source,
  });
  await writeFile(join(source, 'tracked.txt'), content, 'utf8');
  await buildProposalBundle({
    baseCommitSha,
    executionMode: 'product',
    outputDirectory: bundleDirectory,
    repositoryFullName,
    workspacePath: source,
  });
  return { baseCommitSha, bundleDirectory, root, source };
}

function validationOptions(fixture, overrides = {}) {
  return {
    bundleDirectory: fixture.bundleDirectory,
    expectedBaseCommitSha: fixture.baseCommitSha,
    expectedExecutionMode: 'product',
    expectedRepositoryFullName: repositoryFullName,
    ...overrides,
  };
}

test('proposal validation rejects a semantically valid but noncanonical manifest', async () => {
  const fixture = await createBundleFixture();
  try {
    const manifestPath = join(
      fixture.bundleDirectory,
      'proposal-manifest.json',
    );
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    await assert.rejects(
      validateProposalBundle(validationOptions(fixture)),
      /proposal_bundle_invalid:manifest_canonical/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('proposal validation rejects a hard-linked file snapshot', async () => {
  const fixture = await createBundleFixture();
  try {
    await link(
      join(fixture.bundleDirectory, 'files', 'tracked.txt'),
      join(fixture.root, 'outside-hardlink.txt'),
    );
    await assert.rejects(
      validateProposalBundle(validationOptions(fixture)),
      /proposal_bundle_invalid:hard_link/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('proposal validation rejects a symbolic-link artifact root', async () => {
  const fixture = await createBundleFixture();
  const bundleLink = join(fixture.root, 'bundle-link');
  try {
    await symlink(fixture.bundleDirectory, bundleLink, 'dir');
    await assert.rejects(
      validateProposalBundle(
        validationOptions(fixture, { bundleDirectory: bundleLink }),
      ),
      /proposal_bundle_invalid:bundle_directory/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('proposal validation scans artifact payloads for forbidden secret literals', async () => {
  const forbiddenLiteral = 'never-publish-this-secret';
  const fixture = await createBundleFixture(`${forbiddenLiteral}\n`);
  try {
    await assert.rejects(
      validateProposalBundle(
        validationOptions(fixture, {
          forbiddenLiteralValues: [forbiddenLiteral],
        }),
      ),
      /proposal_bundle_invalid:forbidden_literal/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});

test('proposal validation rejects a correctly hashed patch above the byte budget', async () => {
  const fixture = await createBundleFixture();
  try {
    const oversizedPatch = Buffer.alloc(67_108_865, 0x61);
    const patchPath = join(fixture.bundleDirectory, 'proposal.patch');
    const manifestPath = join(
      fixture.bundleDirectory,
      'proposal-manifest.json',
    );
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.patch_sha256 = sha256Hex(oversizedPatch);
    await writeFile(patchPath, oversizedPatch);
    await writeFile(manifestPath, canonicalJson(manifest), 'utf8');

    await assert.rejects(
      validateProposalBundle(validationOptions(fixture)),
      /proposal_bundle_invalid:patch_size/,
    );
  } finally {
    await rm(fixture.root, { force: true, recursive: true });
  }
});
