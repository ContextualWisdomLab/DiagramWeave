/**
 * Verify exact npm package contents with `npm pack --dry-run --json`.
 *
 * The check prevents accidental publication of tests, generated files, source
 * documents, credentials, or unrelated workspace state. It runs only npm's
 * local package planner and never creates a tarball or accesses the network.
 */
import { spawnSync } from 'node:child_process';

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packageContracts = Object.freeze([
  Object.freeze({
    workspace: 'packages/language-server',
    expectedFiles: Object.freeze([
      'package/LICENSE',
      'package/README.md',
      'package/package.json',
      'package/src/completion-session.js',
      'package/src/completions.js',
      'package/src/contracts.js',
      'package/src/diagnostics.js',
      'package/src/errors.js',
      'package/src/index.js',
      'package/src/limits.js',
      'package/src/session.js',
      'package/src/symbol-session.js',
      'package/src/symbols.js',
    ]),
  }),
  Object.freeze({
    workspace: 'packages/language-server-stdio',
    expectedFiles: Object.freeze([
      'package/LICENSE',
      'package/README.md',
      'package/bin/dweave-lsp.js',
      'package/package.json',
      'package/src/connection.js',
      'package/src/errors.js',
      'package/src/framing.js',
      'package/src/index.js',
      'package/src/json-rpc.js',
      'package/src/limits.js',
      'package/src/process.js',
    ]),
  }),
]);

/**
 * Stop the package check with one deterministic diagnostic.
 *
 * @param {string} message - Source-free failure detail.
 * @returns {never} This function always exits the process.
 */
function fail(message) {
  process.stderr.write(`Package contents check failed: ${message}\n`);
  process.exit(1);
}

/**
 * Return the sorted package file list reported by one dry run.
 *
 * @param {string} workspace - Repository-relative npm workspace path.
 * @returns {string[]} Sorted npm package paths.
 */
function packageFiles(workspace) {
  const result = spawnSync(
    npmExecutable,
    ['pack', '--workspace', workspace, '--dry-run', '--json', '--ignore-scripts'],
    {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  if (result.error !== undefined) {
    fail(`${workspace}: npm could not be started.`);
  }
  if (result.status !== 0) {
    fail(`${workspace}: npm pack exited unsuccessfully.`);
  }

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    fail(`${workspace}: npm returned invalid JSON.`);
  }
  if (
    !Array.isArray(report) ||
    report.length !== 1 ||
    !Array.isArray(report[0]?.files)
  ) {
    fail(`${workspace}: npm returned an invalid package report.`);
  }

  const paths = [];
  for (const file of report[0].files) {
    if (file === null || typeof file !== 'object' || typeof file.path !== 'string') {
      fail(`${workspace}: npm returned an invalid package entry.`);
    }
    paths.push(`package/${file.path}`);
  }
  return paths.sort();
}

for (const contract of packageContracts) {
  const actualFiles = packageFiles(contract.workspace);
  const expectedFiles = [...contract.expectedFiles].sort();
  const actual = new Set(actualFiles);
  const expected = new Set(expectedFiles);
  const missing = expectedFiles.filter((path) => !actual.has(path));
  const unexpected = actualFiles.filter((path) => !expected.has(path));
  if (missing.length > 0 || unexpected.length > 0) {
    fail(
      `${contract.workspace}: missing [${missing.join(', ')}]; ` +
      `unexpected [${unexpected.join(', ')}].`,
    );
  }
}

process.stdout.write(
  `Package contents check passed for ${packageContracts.length} workspaces.\n`,
);
