import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

const schemaVersion = '1.0.0';
const maximumFileCount = 2048;
const maximumSourceBytes = 67_108_864;
const maximumPathBytes = 4096;
const sha256Pattern = /^[0-9a-f]{64}$/;
const gitShaPattern = /^[0-9a-f]{40}$/;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/u;
const excludedSourcePaths = new Set(['PR_MESSAGE.md', 'opencode.json']);
const verificationCommands = Object.freeze([
  'npm ci --ignore-scripts --no-audit --no-fund',
  'npm run verify',
  'node scripts/check-package-contents.mjs',
]);

function fail(prefix, reason) {
  const error = new Error(`${prefix}:${reason}`);
  error.code = prefix;
  throw error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, expectedKeys, prefix) {
  const expected = new Set(expectedKeys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      fail(prefix, 'unknown_property');
    }
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) {
      fail(prefix, `missing_property:${key}`);
    }
  }
}

function assertSafeRepositoryPath(value, prefix) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value, 'utf8') > maximumPathBytes ||
    isAbsolute(value) ||
    value.includes('\\') ||
    value.includes('//') ||
    controlCharacterPattern.test(value)
  ) {
    fail(prefix, 'path');
  }
  const pathParts = value.split('/');
  if (
    pathParts.some(
      (pathPart) =>
        pathPart.length === 0 ||
        pathPart === '.' ||
        pathPart === '..' ||
        pathPart === '.git',
    )
  ) {
    fail(prefix, 'path');
  }
  return value;
}

function assertSha256(value, prefix, fieldName) {
  if (typeof value !== 'string' || !sha256Pattern.test(value)) {
    fail(prefix, fieldName);
  }
}

function assertGitSha(value, prefix, fieldName) {
  if (typeof value !== 'string' || !gitShaPattern.test(value)) {
    fail(prefix, fieldName);
  }
}

function assertIntegerInRange(value, minimum, maximum, prefix, fieldName) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(prefix, fieldName);
  }
}

function cloneAndFreeze(value) {
  const clone = JSON.parse(canonicalJson(value));
  const freezeRecursively = (current) => {
    if (current !== null && typeof current === 'object') {
      for (const nestedValue of Object.values(current)) {
        freezeRecursively(nestedValue);
      }
      Object.freeze(current);
    }
    return current;
  };
  return freezeRecursively(clone);
}

function serializeCanonical(value, ancestors) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail('canonical_json_invalid', 'non_finite_number');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    fail('canonical_json_invalid', 'unsupported_value');
  }
  if (ancestors.has(value)) {
    fail('canonical_json_invalid', 'cyclic_value');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value
        .map((entry) => serializeCanonical(entry, ancestors))
        .join(',')}]`;
    }
    if (!isPlainObject(value)) {
      fail('canonical_json_invalid', 'non_plain_object');
    }
    const serializedEntries = Object.keys(value)
      .sort()
      .map((key) => {
        if (value[key] === undefined) {
          fail('canonical_json_invalid', 'unsupported_value');
        }
        return `${JSON.stringify(key)}:${serializeCanonical(value[key], ancestors)}`;
      });
    return `{${serializedEntries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Serialize JSON-compatible data with recursively sorted object keys.
 *
 * The canonical representation always ends with one newline so hashes and
 * files use the same byte sequence. Cycles, undefined values, non-finite
 * numbers, class instances, functions, symbols, and bigint values fail closed.
 *
 * @param {unknown} value JSON-compatible value to serialize.
 * @returns {string} Canonical UTF-8 JSON text ending in one newline.
 * @throws {Error} `canonical_json_invalid:*` when the value is ambiguous.
 */
export function canonicalJson(value) {
  return `${serializeCanonical(value, new Set())}\n`;
}

/**
 * Compute a lowercase SHA-256 digest for trusted bytes or text.
 *
 * @param {string|Buffer|Uint8Array} value Bytes to hash. Strings use UTF-8.
 * @returns {string} Sixty-four lowercase hexadecimal characters.
 * @throws {TypeError} When `value` is not text or byte-oriented data.
 */
export function sha256Hex(value) {
  if (
    typeof value !== 'string' &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Uint8Array)
  ) {
    throw new TypeError('sha256 input must be a string, Buffer, or Uint8Array');
  }
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Validate one proposal manifest independently of artifact contents.
 *
 * Validation is intentionally stricter than general JSON Schema evaluation:
 * it enforces exact properties, UTF-8 byte-order path sorting, unique paths,
 * aggregate counts, aggregate source bytes, safe repository-relative paths,
 * and the only two portable file modes accepted by the publication boundary.
 *
 * @param {unknown} manifest Untrusted parsed manifest value.
 * @returns {Readonly<object>} Deeply frozen validated copy.
 * @throws {Error} `proposal_manifest_invalid:*` on any contract violation.
 */
export function validateProposalManifest(manifest) {
  const prefix = 'proposal_manifest_invalid';
  if (!isPlainObject(manifest)) {
    fail(prefix, 'object');
  }
  assertExactKeys(
    manifest,
    [
      'schema_version',
      'repository_full_name',
      'base_commit_sha',
      'execution_mode',
      'patch_sha256',
      'files',
      'total_file_count',
      'total_source_bytes',
    ],
    prefix,
  );
  if (manifest.schema_version !== schemaVersion) {
    fail(prefix, 'schema_version');
  }
  if (
    typeof manifest.repository_full_name !== 'string' ||
    manifest.repository_full_name.length > 200 ||
    !repositoryPattern.test(manifest.repository_full_name)
  ) {
    fail(prefix, 'repository_full_name');
  }
  assertGitSha(manifest.base_commit_sha, prefix, 'base_commit_sha');
  if (!['product', 'remediation'].includes(manifest.execution_mode)) {
    fail(prefix, 'execution_mode');
  }
  assertSha256(manifest.patch_sha256, prefix, 'patch_sha256');
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length < 1 ||
    manifest.files.length > maximumFileCount
  ) {
    fail(prefix, 'files');
  }
  assertIntegerInRange(
    manifest.total_file_count,
    1,
    maximumFileCount,
    prefix,
    'total_file_count',
  );
  assertIntegerInRange(
    manifest.total_source_bytes,
    0,
    maximumSourceBytes,
    prefix,
    'total_source_bytes',
  );
  if (manifest.total_file_count !== manifest.files.length) {
    fail(prefix, 'total_file_count');
  }

  let previousPath = null;
  let calculatedBytes = 0;
  for (const fileEntry of manifest.files) {
    if (!isPlainObject(fileEntry)) {
      fail(prefix, 'file_entry');
    }
    if (fileEntry.kind === 'file') {
      assertExactKeys(
        fileEntry,
        ['kind', 'path', 'mode', 'sha256', 'size_bytes'],
        prefix,
      );
      if (!['0644', '0755'].includes(fileEntry.mode)) {
        fail(prefix, 'mode');
      }
      assertSha256(fileEntry.sha256, prefix, 'sha256');
      assertIntegerInRange(
        fileEntry.size_bytes,
        0,
        maximumSourceBytes,
        prefix,
        'size_bytes',
      );
      calculatedBytes += fileEntry.size_bytes;
    } else if (fileEntry.kind === 'deleted') {
      assertExactKeys(fileEntry, ['kind', 'path'], prefix);
    } else {
      fail(prefix, 'kind');
    }
    assertSafeRepositoryPath(fileEntry.path, prefix);
    if (
      previousPath !== null &&
      Buffer.compare(Buffer.from(previousPath), Buffer.from(fileEntry.path)) >= 0
    ) {
      fail(prefix, 'files_not_sorted');
    }
    previousPath = fileEntry.path;
  }
  if (calculatedBytes !== manifest.total_source_bytes) {
    fail(prefix, 'total_source_bytes');
  }
  return cloneAndFreeze(manifest);
}

/**
 * Validate a fresh-runner verification receipt.
 *
 * The receipt binds one artifact digest and manifest digest to the exact base
 * revision, exact verification checkout, exact verified source-tree digest,
 * immutable command sequence, and a positive no-source-mutation assertion.
 *
 * @param {unknown} receipt Untrusted parsed receipt value.
 * @returns {Readonly<object>} Deeply frozen validated copy.
 * @throws {Error} `verification_receipt_invalid:*` on contract violation.
 */
export function validateVerificationReceipt(receipt) {
  const prefix = 'verification_receipt_invalid';
  if (!isPlainObject(receipt)) {
    fail(prefix, 'object');
  }
  assertExactKeys(
    receipt,
    [
      'schema_version',
      'proposal_artifact_digest',
      'proposal_manifest_sha256',
      'verified_source_tree_sha256',
      'base_commit_sha',
      'verification_commit_sha',
      'verification_commands',
      'source_unchanged_during_verification',
    ],
    prefix,
  );
  if (receipt.schema_version !== schemaVersion) {
    fail(prefix, 'schema_version');
  }
  if (
    typeof receipt.proposal_artifact_digest !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(receipt.proposal_artifact_digest)
  ) {
    fail(prefix, 'proposal_artifact_digest');
  }
  assertSha256(
    receipt.proposal_manifest_sha256,
    prefix,
    'proposal_manifest_sha256',
  );
  assertSha256(
    receipt.verified_source_tree_sha256,
    prefix,
    'verified_source_tree_sha256',
  );
  assertGitSha(receipt.base_commit_sha, prefix, 'base_commit_sha');
  assertGitSha(
    receipt.verification_commit_sha,
    prefix,
    'verification_commit_sha',
  );
  if (
    !Array.isArray(receipt.verification_commands) ||
    receipt.verification_commands.length !== verificationCommands.length ||
    receipt.verification_commands.some(
      (command, index) => command !== verificationCommands[index],
    )
  ) {
    fail(prefix, 'verification_commands');
  }
  if (receipt.source_unchanged_during_verification !== true) {
    fail(prefix, 'source_unchanged_during_verification');
  }
  return cloneAndFreeze(receipt);
}

function gitEnvironment() {
  return {
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    HOME: process.env.HOME ?? '/tmp',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
  };
}

function runGit(workspacePath, argumentsList, encoding = null) {
  return execFileSync(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'diff.external=',
      ...argumentsList,
    ],
    {
      cwd: workspacePath,
      encoding,
      env: gitEnvironment(),
      maxBuffer: maximumSourceBytes * 2,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function splitNullTerminated(value) {
  return value
    .toString('utf8')
    .split('\0')
    .filter((entry) => entry.length > 0);
}

function sortPaths(paths) {
  return [...paths].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)),
  );
}

function assertOutputOutsideWorkspace(workspacePath, outputDirectory) {
  const workspace = resolve(workspacePath);
  const output = resolve(outputDirectory);
  const relativePath = relative(workspace, output);
  if (
    relativePath === '' ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !isAbsolute(relativePath))
  ) {
    fail('proposal_bundle_invalid', 'output_inside_workspace');
  }
}

async function lstatOrNull(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function assertSafeExistingRegularFile(rootPath, repositoryPath, prefix) {
  assertSafeRepositoryPath(repositoryPath, prefix);
  let cursor = resolve(rootPath);
  const pathParts = repositoryPath.split('/');
  for (let index = 0; index < pathParts.length; index += 1) {
    cursor = join(cursor, pathParts[index]);
    const pathStat = await lstatOrNull(cursor);
    if (pathStat === null) {
      return null;
    }
    if (pathStat.isSymbolicLink()) {
      fail(prefix, 'symbolic_link');
    }
    if (index < pathParts.length - 1 && !pathStat.isDirectory()) {
      fail(prefix, 'non_directory_parent');
    }
    if (index === pathParts.length - 1) {
      if (!pathStat.isFile()) {
        fail(prefix, 'non_regular_file');
      }
      if (pathStat.nlink !== 1) {
        fail(prefix, 'hard_link');
      }
    }
  }
  return lstat(cursor);
}

async function ensureSafeDestinationParent(rootPath, repositoryPath, prefix) {
  assertSafeRepositoryPath(repositoryPath, prefix);
  const pathParts = repositoryPath.split('/');
  let cursor = resolve(rootPath);
  for (const pathPart of pathParts.slice(0, -1)) {
    cursor = join(cursor, pathPart);
    const pathStat = await lstatOrNull(cursor);
    if (pathStat === null) {
      await mkdir(cursor, { mode: 0o700 });
      continue;
    }
    if (pathStat.isSymbolicLink() || !pathStat.isDirectory()) {
      fail(prefix, 'unsafe_destination_parent');
    }
  }
  const targetPath = join(resolve(rootPath), repositoryPath);
  const targetStat = await lstatOrNull(targetPath);
  if (
    targetStat !== null &&
    (targetStat.isSymbolicLink() || !targetStat.isFile())
  ) {
    fail(prefix, 'unsafe_destination');
  }
  return targetPath;
}

async function atomicWriteFile(targetPath, content, mode) {
  await mkdir(dirname(targetPath), { mode: 0o700, recursive: true });
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporaryPath, 'wx', mode);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporaryPath, mode);
  await rename(temporaryPath, targetPath);
}

function normalizeForbiddenValues(forbiddenLiteralValues) {
  if (forbiddenLiteralValues === undefined) {
    return [];
  }
  if (!Array.isArray(forbiddenLiteralValues)) {
    fail('proposal_bundle_invalid', 'forbidden_literal_values');
  }
  return forbiddenLiteralValues.map((value) => {
    if (
      typeof value !== 'string' &&
      !Buffer.isBuffer(value) &&
      !(value instanceof Uint8Array)
    ) {
      fail('proposal_bundle_invalid', 'forbidden_literal_values');
    }
    const bytes = Buffer.from(value);
    if (bytes.length === 0) {
      fail('proposal_bundle_invalid', 'forbidden_literal_values');
    }
    return bytes;
  });
}

function assertNoForbiddenLiteral(content, forbiddenValues) {
  for (const forbiddenValue of forbiddenValues) {
    if (content.includes(forbiddenValue)) {
      fail('proposal_bundle_invalid', 'forbidden_literal');
    }
  }
}

async function collectRegularFiles(rootPath, prefix, currentPath = '') {
  const absolutePath = currentPath
    ? join(rootPath, currentPath)
    : resolve(rootPath);
  const directoryEntries = await readdir(absolutePath, { withFileTypes: true });
  const files = [];
  for (const directoryEntry of directoryEntries) {
    const repositoryPath = currentPath
      ? `${currentPath}/${directoryEntry.name}`
      : directoryEntry.name;
    if (directoryEntry.isSymbolicLink()) {
      fail(prefix, 'symbolic_link');
    }
    if (directoryEntry.isDirectory()) {
      files.push(...(await collectRegularFiles(rootPath, prefix, repositoryPath)));
    } else if (directoryEntry.isFile()) {
      assertSafeRepositoryPath(repositoryPath, prefix);
      files.push(repositoryPath);
    } else {
      fail(prefix, 'non_regular_file');
    }
  }
  return sortPaths(files);
}

function assertExactHead(workspacePath, expectedSha, prefix) {
  const observedSha = runGit(workspacePath, ['rev-parse', 'HEAD'], 'utf8').trim();
  if (observedSha !== expectedSha) {
    fail(prefix, 'base_commit_sha');
  }
}

/**
 * Build one bounded proposal artifact from an exact dirty Git checkout.
 *
 * The output directory must be outside the workspace and must not already
 * exist. The function records all tracked modifications/deletions and regular
 * untracked files except reserved metadata (`PR_MESSAGE.md`, `opencode.json`).
 * It never follows symbolic links, never accepts special files, scans every
 * payload for configured forbidden literal values, writes a full-index binary
 * tracked patch, snapshots every resulting file, and emits a canonical
 * manifest. It does not commit, push, call GitHub, or execute repository code.
 *
 * @param {object} options Build options.
 * @param {string} options.repositoryFullName Expected `owner/repository`.
 * @param {string} options.baseCommitSha Exact checked-out Git commit.
 * @param {'product'|'remediation'} options.executionMode Workflow mode.
 * @param {string} options.workspacePath Dirty proposal checkout.
 * @param {string} options.outputDirectory New artifact directory.
 * @param {(string|Buffer|Uint8Array)[]} [options.forbiddenLiteralValues]
 *   Sensitive byte sequences that must not appear in artifact content.
 * @returns {Promise<Readonly<object>>} Manifest and digest receipt.
 * @throws {Error} `proposal_bundle_invalid:*` for unsafe or empty proposals.
 */
export async function buildProposalBundle(options) {
  if (!isPlainObject(options)) {
    fail('proposal_bundle_invalid', 'options');
  }
  const {
    baseCommitSha,
    executionMode,
    forbiddenLiteralValues,
    outputDirectory,
    repositoryFullName,
    workspacePath,
  } = options;
  if (
    typeof workspacePath !== 'string' ||
    typeof outputDirectory !== 'string' ||
    typeof repositoryFullName !== 'string' ||
    !repositoryPattern.test(repositoryFullName) ||
    !gitShaPattern.test(baseCommitSha) ||
    !['product', 'remediation'].includes(executionMode)
  ) {
    fail('proposal_bundle_invalid', 'options');
  }
  assertOutputOutsideWorkspace(workspacePath, outputDirectory);
  assertExactHead(workspacePath, baseCommitSha, 'proposal_bundle_invalid');
  const forbiddenValues = normalizeForbiddenValues(forbiddenLiteralValues);

  const trackedPaths = splitNullTerminated(
    runGit(workspacePath, [
      'diff',
      '--name-only',
      '-z',
      '--no-renames',
      baseCommitSha,
      '--',
    ]),
  );
  if (trackedPaths.some((path) => excludedSourcePaths.has(path))) {
    fail('proposal_bundle_invalid', 'reserved_path_modified');
  }
  const untrackedPaths = splitNullTerminated(
    runGit(workspacePath, ['ls-files', '--others', '--exclude-standard', '-z']),
  ).filter((path) => !excludedSourcePaths.has(path));
  const proposalPaths = sortPaths(new Set([...trackedPaths, ...untrackedPaths]));
  if (proposalPaths.length < 1 || proposalPaths.length > maximumFileCount) {
    fail('proposal_bundle_invalid', 'file_count');
  }

  const patch = runGit(workspacePath, [
    'diff',
    '--binary',
    '--full-index',
    '--no-ext-diff',
    '--no-textconv',
    '--no-renames',
    baseCommitSha,
    '--',
  ]);
  if (patch.length > maximumSourceBytes) {
    fail('proposal_bundle_invalid', 'patch_size');
  }
  assertNoForbiddenLiteral(patch, forbiddenValues);

  await mkdir(outputDirectory, { mode: 0o700 });
  const filesDirectory = join(outputDirectory, 'files');
  await mkdir(filesDirectory, { mode: 0o700 });
  await atomicWriteFile(join(outputDirectory, 'proposal.patch'), patch, 0o600);

  const fileEntries = [];
  let totalSourceBytes = 0;
  for (const repositoryPath of proposalPaths) {
    const sourceStat = await assertSafeExistingRegularFile(
      workspacePath,
      repositoryPath,
      'proposal_bundle_invalid',
    );
    if (sourceStat === null) {
      fileEntries.push({ kind: 'deleted', path: repositoryPath });
      continue;
    }
    const content = await readFile(join(workspacePath, repositoryPath));
    assertNoForbiddenLiteral(content, forbiddenValues);
    totalSourceBytes += content.length;
    if (totalSourceBytes > maximumSourceBytes) {
      fail('proposal_bundle_invalid', 'total_source_bytes');
    }
    const mode = sourceStat.mode & 0o111 ? '0755' : '0644';
    const targetPath = await ensureSafeDestinationParent(
      filesDirectory,
      repositoryPath,
      'proposal_bundle_invalid',
    );
    await atomicWriteFile(targetPath, content, mode === '0755' ? 0o755 : 0o644);
    fileEntries.push({
      kind: 'file',
      mode,
      path: repositoryPath,
      sha256: sha256Hex(content),
      size_bytes: content.length,
    });
  }

  const manifest = validateProposalManifest({
    base_commit_sha: baseCommitSha,
    execution_mode: executionMode,
    files: fileEntries,
    patch_sha256: sha256Hex(patch),
    repository_full_name: repositoryFullName,
    schema_version: schemaVersion,
    total_file_count: fileEntries.length,
    total_source_bytes: totalSourceBytes,
  });
  const manifestContent = canonicalJson(manifest);
  assertNoForbiddenLiteral(Buffer.from(manifestContent), forbiddenValues);
  const manifestPath = join(outputDirectory, 'proposal-manifest.json');
  await atomicWriteFile(manifestPath, manifestContent, 0o600);
  return Object.freeze({
    manifestPath,
    manifestSha256: sha256Hex(manifestContent),
    patchSha256: manifest.patch_sha256,
    totalFileCount: manifest.total_file_count,
    totalSourceBytes: manifest.total_source_bytes,
  });
}

/**
 * Validate one proposal artifact directory without materializing it.
 *
 * Validation requires exactly `proposal-manifest.json`, `proposal.patch`, and
 * `files/`; checks the expected repository, base revision, and mode; verifies
 * patch and file hashes, byte counts, modes, path safety, and absence of extra
 * file snapshots. It performs no repository mutation and executes no artifact
 * content.
 *
 * @param {object} options Validation options.
 * @param {string} options.bundleDirectory Artifact directory.
 * @param {string} options.expectedRepositoryFullName Expected repository.
 * @param {string} options.expectedBaseCommitSha Expected exact base SHA.
 * @param {'product'|'remediation'} options.expectedExecutionMode Expected mode.
 * @param {(string|Buffer|Uint8Array)[]} [options.forbiddenLiteralValues]
 *   Sensitive byte sequences forbidden anywhere in the artifact payload.
 * @returns {Promise<Readonly<object>>} Deeply frozen validated manifest.
 * @throws {Error} `proposal_bundle_invalid:*` on tampering or mismatch.
 */
export async function validateProposalBundle(options) {
  if (!isPlainObject(options)) {
    fail('proposal_bundle_invalid', 'options');
  }
  const {
    bundleDirectory,
    expectedBaseCommitSha,
    expectedExecutionMode,
    expectedRepositoryFullName,
    forbiddenLiteralValues,
  } = options;
  const forbiddenValues = normalizeForbiddenValues(forbiddenLiteralValues);
  const bundleStat = await lstatOrNull(bundleDirectory);
  if (
    bundleStat === null ||
    bundleStat.isSymbolicLink() ||
    !bundleStat.isDirectory()
  ) {
    fail('proposal_bundle_invalid', 'bundle_directory');
  }
  const topLevelEntries = await readdir(bundleDirectory, { withFileTypes: true });
  const observedTopLevel = sortPaths(topLevelEntries.map((entry) => entry.name));
  const expectedTopLevel = ['files', 'proposal-manifest.json', 'proposal.patch'];
  if (
    observedTopLevel.length !== expectedTopLevel.length ||
    observedTopLevel.some((entry, index) => entry !== expectedTopLevel[index])
  ) {
    fail('proposal_bundle_invalid', 'unexpected_artifact_entry');
  }
  const filesEntry = topLevelEntries.find((entry) => entry.name === 'files');
  if (!filesEntry?.isDirectory() || filesEntry.isSymbolicLink()) {
    fail('proposal_bundle_invalid', 'files_directory');
  }
  for (const requiredFile of ['proposal-manifest.json', 'proposal.patch']) {
    const directoryEntry = topLevelEntries.find((entry) => entry.name === requiredFile);
    if (!directoryEntry?.isFile() || directoryEntry.isSymbolicLink()) {
      fail('proposal_bundle_invalid', requiredFile);
    }
    const requiredStat = await lstat(join(bundleDirectory, requiredFile));
    if (requiredStat.nlink !== 1) {
      fail('proposal_bundle_invalid', 'hard_link');
    }
  }

  let manifestContent;
  let parsedManifest;
  try {
    manifestContent = await readFile(
      join(bundleDirectory, 'proposal-manifest.json'),
      'utf8',
    );
    parsedManifest = JSON.parse(manifestContent);
  } catch {
    fail('proposal_bundle_invalid', 'manifest_json');
  }
  const manifest = validateProposalManifest(parsedManifest);
  if (manifestContent !== canonicalJson(manifest)) {
    fail('proposal_bundle_invalid', 'manifest_canonical');
  }
  assertNoForbiddenLiteral(Buffer.from(manifestContent), forbiddenValues);
  if (manifest.repository_full_name !== expectedRepositoryFullName) {
    fail('proposal_bundle_invalid', 'repository_full_name');
  }
  if (manifest.base_commit_sha !== expectedBaseCommitSha) {
    fail('proposal_bundle_invalid', 'base_commit_sha');
  }
  if (manifest.execution_mode !== expectedExecutionMode) {
    fail('proposal_bundle_invalid', 'execution_mode');
  }
  const patch = await readFile(join(bundleDirectory, 'proposal.patch'));
  if (patch.length > maximumSourceBytes) {
    fail('proposal_bundle_invalid', 'patch_size');
  }
  assertNoForbiddenLiteral(patch, forbiddenValues);
  if (sha256Hex(patch) !== manifest.patch_sha256) {
    fail('proposal_bundle_invalid', 'patch_sha256');
  }

  const observedSnapshots = await collectRegularFiles(
    join(bundleDirectory, 'files'),
    'proposal_bundle_invalid',
  );
  const expectedSnapshots = manifest.files
    .filter((fileEntry) => fileEntry.kind === 'file')
    .map((fileEntry) => fileEntry.path);
  if (
    observedSnapshots.length !== expectedSnapshots.length ||
    observedSnapshots.some((entry, index) => entry !== expectedSnapshots[index])
  ) {
    fail('proposal_bundle_invalid', 'file_snapshot_set');
  }
  for (const fileEntry of manifest.files) {
    if (fileEntry.kind === 'deleted') {
      continue;
    }
    const snapshotPath = join(bundleDirectory, 'files', fileEntry.path);
    const snapshotStat = await assertSafeExistingRegularFile(
      join(bundleDirectory, 'files'),
      fileEntry.path,
      'proposal_bundle_invalid',
    );
    if (snapshotStat === null) {
      fail('proposal_bundle_invalid', 'missing_file_snapshot');
    }
    const snapshot = await readFile(snapshotPath);
    assertNoForbiddenLiteral(snapshot, forbiddenValues);
    const observedMode = snapshotStat.mode & 0o111 ? '0755' : '0644';
    if (
      snapshot.length !== fileEntry.size_bytes ||
      sha256Hex(snapshot) !== fileEntry.sha256 ||
      observedMode !== fileEntry.mode
    ) {
      fail('proposal_bundle_invalid', 'file_snapshot');
    }
  }
  return manifest;
}

/**
 * Materialize a validated proposal into a clean checkout at the exact base SHA.
 *
 * The function copies only manifest-listed regular files, applies only listed
 * deletions, preserves the normalized executable bit, and verifies that the
 * resulting tracked Git patch exactly equals the artifact patch. It rejects a
 * dirty target, symbolic links, special files, base drift, extra snapshots,
 * and all digest mismatches. It never stages, commits, pushes, or executes
 * repository content.
 *
 * @param {object} options Materialization options.
 * @param {string} options.bundleDirectory Validated artifact directory.
 * @param {string} options.targetWorkspacePath Clean exact-base checkout.
 * @param {string} options.expectedRepositoryFullName Expected repository.
 * @param {string} options.expectedBaseCommitSha Expected exact base SHA.
 * @param {'product'|'remediation'} options.expectedExecutionMode Expected mode.
 * @param {(string|Buffer|Uint8Array)[]} [options.forbiddenLiteralValues]
 *   Sensitive byte sequences forbidden anywhere in the artifact payload.
 * @returns {Promise<Readonly<object>>} Validated manifest.
 * @throws {Error} `proposal_materialization_invalid:*` on any mismatch.
 */
export async function materializeProposalBundle(options) {
  if (!isPlainObject(options)) {
    fail('proposal_materialization_invalid', 'options');
  }
  const {
    bundleDirectory,
    expectedBaseCommitSha,
    expectedExecutionMode,
    expectedRepositoryFullName,
    forbiddenLiteralValues,
    targetWorkspacePath,
  } = options;
  const manifest = await validateProposalBundle({
    bundleDirectory,
    expectedBaseCommitSha,
    expectedExecutionMode,
    expectedRepositoryFullName,
    forbiddenLiteralValues,
  });
  assertExactHead(
    targetWorkspacePath,
    expectedBaseCommitSha,
    'proposal_materialization_invalid',
  );
  if (
    runGit(
      targetWorkspacePath,
      ['status', '--porcelain', '--untracked-files=all'],
      'utf8',
    ).trim() !== ''
  ) {
    fail('proposal_materialization_invalid', 'dirty_target');
  }

  for (const fileEntry of manifest.files) {
    const targetPath = await ensureSafeDestinationParent(
      targetWorkspacePath,
      fileEntry.path,
      'proposal_materialization_invalid',
    );
    if (fileEntry.kind === 'deleted') {
      const targetStat = await lstatOrNull(targetPath);
      if (targetStat === null || targetStat.isSymbolicLink() || !targetStat.isFile()) {
        fail('proposal_materialization_invalid', 'deletion_target');
      }
      await rm(targetPath);
      continue;
    }
    const snapshot = await readFile(
      join(bundleDirectory, 'files', fileEntry.path),
    );
    await atomicWriteFile(
      targetPath,
      snapshot,
      fileEntry.mode === '0755' ? 0o755 : 0o644,
    );
  }

  const expectedPatch = await readFile(join(bundleDirectory, 'proposal.patch'));
  const observedPatch = runGit(targetWorkspacePath, [
    'diff',
    '--binary',
    '--full-index',
    '--no-ext-diff',
    '--no-textconv',
    '--no-renames',
    expectedBaseCommitSha,
    '--',
  ]);
  if (!observedPatch.equals(expectedPatch)) {
    fail('proposal_materialization_invalid', 'tracked_patch_mismatch');
  }
  for (const fileEntry of manifest.files) {
    const targetStat = await assertSafeExistingRegularFile(
      targetWorkspacePath,
      fileEntry.path,
      'proposal_materialization_invalid',
    );
    if (fileEntry.kind === 'deleted') {
      if (targetStat !== null) {
        fail('proposal_materialization_invalid', 'deletion_not_applied');
      }
      continue;
    }
    if (targetStat === null) {
      fail('proposal_materialization_invalid', 'missing_materialized_file');
    }
    const content = await readFile(join(targetWorkspacePath, fileEntry.path));
    const mode = targetStat.mode & 0o111 ? '0755' : '0644';
    if (
      content.length !== fileEntry.size_bytes ||
      sha256Hex(content) !== fileEntry.sha256 ||
      mode !== fileEntry.mode
    ) {
      fail('proposal_materialization_invalid', 'materialized_file');
    }
  }
  return manifest;
}

/**
 * Hash the final source tree of one Git checkout without reading Git metadata.
 *
 * The tree includes tracked and non-ignored untracked regular files, skips
 * tracked deletions, and excludes reserved proposal metadata. Each entry binds
 * its UTF-8 path, normalized executable bit, byte length, and SHA-256 content
 * digest. Symbolic links, special files, unsafe paths, excessive counts, and
 * excessive aggregate bytes fail closed.
 *
 * @param {object} options Hash options.
 * @param {string} options.workspacePath Git checkout to inspect.
 * @returns {Promise<string>} Lowercase SHA-256 of the canonical entry list.
 * @throws {Error} `source_tree_invalid:*` on unsafe or oversized content.
 */
export async function hashSourceTree(options) {
  if (!isPlainObject(options) || typeof options.workspacePath !== 'string') {
    fail('source_tree_invalid', 'options');
  }
  const { workspacePath } = options;
  const candidatePaths = sortPaths(
    new Set(
      splitNullTerminated(
        runGit(workspacePath, [
          'ls-files',
          '--cached',
          '--others',
          '--exclude-standard',
          '-z',
        ]),
      ).filter((path) => !excludedSourcePaths.has(path)),
    ),
  );
  if (candidatePaths.length > maximumFileCount) {
    fail('source_tree_invalid', 'file_count');
  }
  const entries = [];
  let totalBytes = 0;
  for (const repositoryPath of candidatePaths) {
    const sourceStat = await assertSafeExistingRegularFile(
      workspacePath,
      repositoryPath,
      'source_tree_invalid',
    );
    if (sourceStat === null) {
      continue;
    }
    const content = await readFile(join(workspacePath, repositoryPath));
    totalBytes += content.length;
    if (totalBytes > maximumSourceBytes) {
      fail('source_tree_invalid', 'total_source_bytes');
    }
    entries.push({
      mode: sourceStat.mode & 0o111 ? '0755' : '0644',
      path: repositoryPath,
      sha256: sha256Hex(content),
      size_bytes: content.length,
    });
  }
  return sha256Hex(canonicalJson(entries));
}
