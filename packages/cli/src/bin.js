#!/usr/bin/env node

import { CliError } from './errors.js';
import { createInvocationReport } from './execute.js';
import { runDiagramWeaveCli } from './index.js';
import { formatCliReport } from './presentation.js';

/**
 * Execute the CLI process boundary through injectable streams and exit-code handling.
 *
 * @param {string[]} argv - Command-line arguments without executable paths.
 * @param {object} environment - Process environment record.
 * @param {{stdout(value: string): void, stderr(value: string): void, setExitCode(value: number): void}} io - Process boundary adapter.
 * @param {{runCli?: Function}} [options] - Optional deterministic test seam.
 * @returns {Promise<Readonly<object>>} Frozen execution report.
 */
export async function runCliProcess(argv, environment, io, options = {}) {
  const json = Array.isArray(argv) && argv.includes('--json');
  const runCli = options.runCli ?? runDiagramWeaveCli;
  let report;
  try {
    report = await runCli(argv, { environment });
  } catch {
    report = createInvocationReport(null, new CliError(
      'internal_cli_error',
      'DiagramWeave CLI encountered an internal failure.',
    ));
  }
  const serialized = formatCliReport(report, json);
  if (report.exitCode === 2 && !json) {
    io.stderr(serialized);
  } else {
    io.stdout(serialized);
  }
  io.setExitCode(report.exitCode);
  return report;
}

/**
 * Write serialized CLI output to the process standard-output stream.
 *
 * @param {string} value - Serialized output.
 * @returns {boolean} Stream write result.
 */
export function writeProcessStdout(value) {
  return process.stdout.write(value);
}

/**
 * Write serialized CLI output to the process standard-error stream.
 *
 * @param {string} value - Serialized output.
 * @returns {boolean} Stream write result.
 */
export function writeProcessStderr(value) {
  return process.stderr.write(value);
}

/**
 * Set the process exit code without terminating the host immediately.
 *
 * @param {number} value - Stable CLI exit code.
 * @returns {void}
 */
export function setProcessExitCode(value) {
  process.exitCode = value;
}

await runCliProcess(
  process.argv.slice(2),
  process.env,
  {
    stdout: writeProcessStdout,
    stderr: writeProcessStderr,
    setExitCode: setProcessExitCode,
  },
);
