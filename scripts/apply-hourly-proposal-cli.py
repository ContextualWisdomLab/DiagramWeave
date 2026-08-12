"""Add the trusted proposal-bundle command-line dispatcher.

This one-shot helper is removed by the GREEN verification workflow before the
verified durable commit is created.
"""

from pathlib import Path


path = Path("scripts/hourly-proposal-bundle.mjs")
text = path.read_text(encoding="utf-8")
import_marker = """} from 'node:path';

const schemaVersion = '1.0.0';
"""
replacement = """} from 'node:path';
import { pathToFileURL } from 'node:url';

const schemaVersion = '1.0.0';
"""
count = text.count(import_marker)
if count != 1:
    raise SystemExit(f"CLI URL import marker: expected one match, found {count}")
text = text.replace(import_marker, replacement, 1)

cli_source = r'''

function parseCliOptions(argumentsList, allowedOptions, repeatableOptions = new Set()) {
  const options = Object.create(null);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const token = argumentsList[index];
    if (typeof token !== 'string' || !token.startsWith('--') || token.length <= 2) {
      fail('hourly_proposal_cli_invalid', 'positional_argument');
    }
    const optionName = token.slice(2);
    if (!allowedOptions.has(optionName)) {
      fail('hourly_proposal_cli_invalid', `unknown_option:${optionName}`);
    }
    if (
      index + 1 >= argumentsList.length ||
      argumentsList[index + 1].startsWith('--')
    ) {
      fail('hourly_proposal_cli_invalid', `missing_option:${optionName}`);
    }
    const optionValue = argumentsList[index + 1];
    index += 1;
    if (repeatableOptions.has(optionName)) {
      options[optionName] ??= [];
      options[optionName].push(optionValue);
    } else {
      if (Object.hasOwn(options, optionName)) {
        fail('hourly_proposal_cli_invalid', `duplicate_option:${optionName}`);
      }
      options[optionName] = optionValue;
    }
  }
  return options;
}

function requiredCliOption(options, optionName) {
  if (!Object.hasOwn(options, optionName)) {
    fail('hourly_proposal_cli_invalid', `missing_option:${optionName}`);
  }
  return options[optionName];
}

function forbiddenValuesFromEnvironment(options, environment) {
  const environmentNames = options['forbid-literal-env'] ?? [];
  return environmentNames.map((environmentName) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(environmentName)) {
      fail('hourly_proposal_cli_invalid', 'forbid_literal_environment_name');
    }
    const environmentValue = environment[environmentName];
    if (typeof environmentValue !== 'string' || environmentValue.length === 0) {
      fail(
        'hourly_proposal_cli_invalid',
        `missing_environment:${environmentName}`,
      );
    }
    return environmentValue;
  });
}

async function readCanonicalReceipt(receiptPath) {
  const receiptStat = await lstatOrNull(receiptPath);
  if (
    receiptStat === null ||
    receiptStat.isSymbolicLink() ||
    !receiptStat.isFile() ||
    receiptStat.nlink !== 1
  ) {
    fail('verification_receipt_invalid', 'receipt_file');
  }
  let receiptContent;
  let parsedReceipt;
  try {
    receiptContent = await readFile(receiptPath, 'utf8');
    parsedReceipt = JSON.parse(receiptContent);
  } catch {
    fail('verification_receipt_invalid', 'receipt_json');
  }
  const receipt = validateVerificationReceipt(parsedReceipt);
  if (receiptContent !== canonicalJson(receipt)) {
    fail('verification_receipt_invalid', 'receipt_canonical');
  }
  return receipt;
}

function compareReceiptEvidence(receipt, options) {
  const expectedFields = [
    ['artifact-digest', 'proposal_artifact_digest'],
    ['manifest-sha256', 'proposal_manifest_sha256'],
    ['base-sha', 'base_commit_sha'],
    ['tree-sha256', 'verified_source_tree_sha256'],
  ];
  for (const [optionName, receiptField] of expectedFields) {
    if (
      Object.hasOwn(options, optionName) &&
      options[optionName] !== receipt[receiptField]
    ) {
      fail('verification_receipt_mismatch', receiptField);
    }
  }
}

/**
 * Execute one trusted proposal-bundle CLI command without ambient authority.
 *
 * Arguments are parsed with an exact allowlist; options may not be abbreviated,
 * duplicated, supplied positionally, or read implicitly from ambient state.
 * Sensitive literals enter only through explicitly named environment variables
 * and are passed to artifact scanners without being written to output or errors.
 * The function creates, validates, hashes, or materializes proposal evidence but
 * never stages, commits, pushes, calls GitHub, executes repository scripts, or
 * reads a repository credential.
 *
 * @param {string[]} argumentsList CLI arguments after the executable path.
 * @param {NodeJS.ProcessEnv} [environment=process.env] Explicit environment map.
 * @returns {Promise<string>} Canonical JSON or one lowercase digest plus newline.
 * @throws {Error} Fixed source-free contract errors for invalid input or evidence.
 */
export async function runHourlyProposalCli(
  argumentsList,
  environment = process.env,
) {
  if (!Array.isArray(argumentsList) || argumentsList.length === 0) {
    fail('hourly_proposal_cli_invalid', 'command');
  }
  const [command, ...optionArguments] = argumentsList;
  const repeatableOptions = new Set(['forbid-literal-env']);

  if (command === 'build') {
    const options = parseCliOptions(
      optionArguments,
      new Set([
        'repository',
        'base-sha',
        'execution-mode',
        'workspace',
        'output',
        'forbid-literal-env',
      ]),
      repeatableOptions,
    );
    const buildReceipt = await buildProposalBundle({
      baseCommitSha: requiredCliOption(options, 'base-sha'),
      executionMode: requiredCliOption(options, 'execution-mode'),
      forbiddenLiteralValues: forbiddenValuesFromEnvironment(options, environment),
      outputDirectory: requiredCliOption(options, 'output'),
      repositoryFullName: requiredCliOption(options, 'repository'),
      workspacePath: requiredCliOption(options, 'workspace'),
    });
    return canonicalJson({
      manifestSha256: buildReceipt.manifestSha256,
      patchSha256: buildReceipt.patchSha256,
      totalFileCount: buildReceipt.totalFileCount,
      totalSourceBytes: buildReceipt.totalSourceBytes,
    });
  }

  if (command === 'validate') {
    const options = parseCliOptions(
      optionArguments,
      new Set([
        'repository',
        'base-sha',
        'execution-mode',
        'bundle',
        'forbid-literal-env',
      ]),
      repeatableOptions,
    );
    const manifest = await validateProposalBundle({
      bundleDirectory: requiredCliOption(options, 'bundle'),
      expectedBaseCommitSha: requiredCliOption(options, 'base-sha'),
      expectedExecutionMode: requiredCliOption(options, 'execution-mode'),
      expectedRepositoryFullName: requiredCliOption(options, 'repository'),
      forbiddenLiteralValues: forbiddenValuesFromEnvironment(options, environment),
    });
    return canonicalJson(manifest);
  }

  if (command === 'materialize') {
    const options = parseCliOptions(
      optionArguments,
      new Set([
        'repository',
        'base-sha',
        'execution-mode',
        'bundle',
        'workspace',
        'forbid-literal-env',
      ]),
      repeatableOptions,
    );
    const manifest = await materializeProposalBundle({
      bundleDirectory: requiredCliOption(options, 'bundle'),
      expectedBaseCommitSha: requiredCliOption(options, 'base-sha'),
      expectedExecutionMode: requiredCliOption(options, 'execution-mode'),
      expectedRepositoryFullName: requiredCliOption(options, 'repository'),
      forbiddenLiteralValues: forbiddenValuesFromEnvironment(options, environment),
      targetWorkspacePath: requiredCliOption(options, 'workspace'),
    });
    return canonicalJson(manifest);
  }

  if (command === 'hash-tree') {
    const options = parseCliOptions(
      optionArguments,
      new Set(['workspace']),
    );
    const digest = await hashSourceTree({
      workspacePath: requiredCliOption(options, 'workspace'),
    });
    return `${digest}\n`;
  }

  if (command === 'verify-receipt') {
    const options = parseCliOptions(
      optionArguments,
      new Set([
        'receipt',
        'artifact-digest',
        'manifest-sha256',
        'base-sha',
        'tree-sha256',
      ]),
    );
    const receipt = await readCanonicalReceipt(
      requiredCliOption(options, 'receipt'),
    );
    compareReceiptEvidence(receipt, options);
    return canonicalJson(receipt);
  }

  fail('hourly_proposal_cli_invalid', 'command');
}

function safeCliErrorMessage(error) {
  const message = error instanceof Error ? error.message : '';
  const acceptedPrefixes = [
    'canonical_json_invalid:',
    'hourly_proposal_cli_invalid:',
    'proposal_bundle_invalid:',
    'proposal_manifest_invalid:',
    'proposal_materialization_invalid:',
    'source_tree_invalid:',
    'verification_receipt_invalid:',
    'verification_receipt_mismatch:',
  ];
  return acceptedPrefixes.some((prefix) => message.startsWith(prefix))
    ? message
    : 'hourly_proposal_cli_failed';
}

async function main() {
  try {
    const output = await runHourlyProposalCli(process.argv.slice(2), process.env);
    process.stdout.write(output);
  } catch (error) {
    process.stderr.write(`${safeCliErrorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

if (
  typeof process.argv[1] === 'string' &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
'''

if "export async function runHourlyProposalCli" in text:
    raise SystemExit("trusted CLI dispatcher already exists")
text = f"{text.rstrip()}\n{cli_source}"
path.write_text(text, encoding="utf-8")
