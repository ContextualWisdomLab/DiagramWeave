import { randomUUID } from 'node:crypto';
import {
  basename,
  dirname,
  extname,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';

import { CliError } from './errors.js';

const supportedExtensions = new Set(['.puml', '.plantuml']);

/**
 * Return whether an unknown exception has one Node.js error code.
 *
 * @param {unknown} error - Candidate exception.
 * @param {string} code - Expected error code.
 * @returns {boolean} True when the error exposes the requested code.
 */
function hasErrorCode(error, code) {
  return error !== null && typeof error === 'object' && error.code === code;
}

/**
 * Normalize one report path to portable forward slashes.
 *
 * @param {string} path - Platform path.
 * @returns {string} Portable relative path.
 */
function reportPath(path) {
  return path.split(sep).join('/');
}

/**
 * Return whether a candidate path remains inside a root directory.
 *
 * @param {string} root - Absolute root directory.
 * @param {string} candidate - Absolute candidate path.
 * @returns {boolean} True when candidate is a strict descendant or the root itself.
 */
function isWithin(root, candidate) {
  const displacement = relative(root, candidate);
  return displacement === '' || (!displacement.startsWith(`..${sep}`) && displacement !== '..' && !parse(displacement).root);
}

/**
 * Read one lstat result while treating a missing path as null.
 *
 * @param {object} fileSystem - Filesystem adapter.
 * @param {string} path - Absolute path.
 * @param {string} failureCode - Stable operational failure code.
 * @returns {Promise<object|null>} lstat result or null.
 */
async function lstatOrNull(fileSystem, path, failureCode) {
  try {
    return await fileSystem.lstat(path);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw new CliError(failureCode, 'Filesystem metadata could not be read.');
  }
}

/**
 * Reject symbolic links in every existing segment of one absolute path.
 *
 * @param {string} absolutePath - Path to inspect.
 * @param {object} fileSystem - Filesystem adapter.
 * @param {string} symlinkCode - Stable symlink rejection code.
 * @param {string} failureCode - Stable metadata failure code.
 * @returns {Promise<void>}
 */
async function rejectSymlinkSegments(absolutePath, fileSystem, symlinkCode, failureCode) {
  const root = parse(absolutePath).root;
  const parts = relative(root, absolutePath).split(sep).filter((part) => part.length > 0);
  let cursor = root;
  for (const part of parts) {
    cursor = join(cursor, part);
    const metadata = await lstatOrNull(fileSystem, cursor, failureCode);
    if (metadata === null) {
      return;
    }
    if (metadata.isSymbolicLink()) {
      throw new CliError(symlinkCode, 'Symbolic links are not allowed.');
    }
  }
}

/**
 * Return the supported source extension for one path.
 *
 * @param {string} path - Candidate source path.
 * @returns {string|null} Lowercase supported extension or null.
 */
function sourceExtension(path) {
  const extension = extname(path).toLowerCase();
  return supportedExtensions.has(extension) ? extension : null;
}

/**
 * Freeze an array and each record it owns.
 *
 * @param {object[]} records - Mutable records.
 * @returns {readonly object[]} Frozen records and array.
 */
function freezeRecords(records) {
  return Object.freeze(records.map((record) => Object.freeze(record)));
}

/**
 * Discover one safe PlantUML file or a deterministic recursive directory batch.
 *
 * @param {string} inputPath - User-supplied file or directory path.
 * @param {object} fileSystem - Adapter exposing `cwd`, `lstat`, and `readdir`.
 * @returns {Promise<Readonly<{inputKind: 'file'|'directory', rootPath: string, inputs: readonly object[]}>>} Frozen discovery result.
 * @throws {CliError} When the input is missing, unsupported, unreadable, empty, or symlinked.
 */
export async function discoverDiagramInputs(inputPath, fileSystem) {
  const absoluteInput = resolve(fileSystem.cwd(), inputPath);
  await rejectSymlinkSegments(
    absoluteInput,
    fileSystem,
    'input_symlink_rejected',
    'input_read_failed',
  );
  const rootMetadata = await lstatOrNull(fileSystem, absoluteInput, 'input_read_failed');
  if (rootMetadata === null) {
    throw new CliError('input_not_found', 'The input path does not exist.');
  }

  if (rootMetadata.isFile()) {
    const extension = sourceExtension(absoluteInput);
    if (extension === null) {
      throw new CliError('input_not_supported', 'The input file type is not supported.');
    }
    return Object.freeze({
      inputKind: 'file',
      rootPath: absoluteInput,
      inputs: freezeRecords([{
        absolutePath: absoluteInput,
        relativePath: basename(absoluteInput),
        sourceExtension: extension,
      }]),
    });
  }
  if (!rootMetadata.isDirectory()) {
    throw new CliError('input_not_supported', 'The input must be a regular file or directory.');
  }

  const inputs = [];
  const identities = new Set();
  const pending = [{ absolutePath: absoluteInput, relativePath: '' }];
  while (pending.length > 0) {
    const current = pending.pop();
    let entries;
    try {
      entries = await fileSystem.readdir(current.absolutePath, { withFileTypes: true });
    } catch {
      throw new CliError('input_read_failed', 'An input directory could not be read.');
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      const childAbsolute = resolve(current.absolutePath, entry.name);
      if (!isWithin(absoluteInput, childAbsolute)) {
        throw new CliError('input_not_supported', 'An input path escaped its directory root.');
      }
      const childRelative = current.relativePath === ''
        ? entry.name
        : join(current.relativePath, entry.name);
      const metadata = await lstatOrNull(fileSystem, childAbsolute, 'input_read_failed');
      if (metadata === null) {
        throw new CliError('input_read_failed', 'An input changed during discovery.');
      }
      if (metadata.isSymbolicLink()) {
        throw new CliError('input_symlink_rejected', 'Symbolic links are not allowed.');
      }
      if (metadata.isDirectory()) {
        pending.push({ absolutePath: childAbsolute, relativePath: childRelative });
        continue;
      }
      if (!metadata.isFile()) {
        throw new CliError('input_not_supported', 'Directory inputs may contain only files and directories.');
      }
      const extension = sourceExtension(childAbsolute);
      if (extension === null) {
        continue;
      }
      const portableRelative = reportPath(childRelative);
      const identity = portableRelative.toLowerCase();
      if (identities.has(identity)) {
        throw new CliError('input_not_supported', 'Duplicate diagram identities are not allowed.');
      }
      identities.add(identity);
      inputs.push({
        absolutePath: childAbsolute,
        relativePath: portableRelative,
        sourceExtension: extension,
      });
    }
  }
  inputs.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  if (inputs.length === 0) {
    throw new CliError('input_empty', 'The input directory contains no supported diagrams.');
  }
  return Object.freeze({
    inputKind: 'directory',
    rootPath: absoluteInput,
    inputs: freezeRecords(inputs),
  });
}

/**
 * Preflight deterministic render destinations without creating directories.
 *
 * @param {readonly object[]} inputs - Discovered diagram inputs.
 * @param {'file'|'directory'} inputKind - Discovery kind.
 * @param {string} outputPath - User-supplied output file or directory.
 * @param {'svg'|'png'} format - Requested artifact format.
 * @param {boolean} overwrite - Whether regular output files may be replaced.
 * @param {object} fileSystem - Filesystem adapter.
 * @returns {Promise<Readonly<{rootPath: string, destinations: readonly object[]}>>} Frozen render plan.
 * @throws {CliError} When output paths collide, escape, exist unsafely, or use symlinks.
 */
export async function planRenderOutputs(
  inputs,
  inputKind,
  outputPath,
  format,
  overwrite,
  fileSystem,
) {
  if (!Array.isArray(inputs) || (inputKind !== 'file' && inputKind !== 'directory')) {
    throw new CliError('invalid_cli_arguments', 'Render planning inputs are invalid.');
  }
  const absoluteOutput = resolve(fileSystem.cwd(), outputPath);
  await rejectSymlinkSegments(
    absoluteOutput,
    fileSystem,
    'output_symlink_rejected',
    'output_write_failed',
  );

  const rootMetadata = await lstatOrNull(fileSystem, absoluteOutput, 'output_write_failed');
  if (inputKind === 'file') {
    if (inputs.length !== 1 || extname(absoluteOutput).toLowerCase() !== `.${format}`) {
      throw new CliError('output_collision', 'A single-file output must match the requested format.');
    }
    if (rootMetadata !== null && (!rootMetadata.isFile() || !overwrite)) {
      throw new CliError('output_exists', 'The output path already exists.');
    }
    if (resolve(inputs[0].absolutePath).toLowerCase() === absoluteOutput.toLowerCase()) {
      throw new CliError('output_collision', 'An output path may not replace a source file.');
    }
    return Object.freeze({
      rootPath: absoluteOutput,
      destinations: freezeRecords([{
        input: inputs[0],
        absolutePath: absoluteOutput,
        outputPath: basename(absoluteOutput),
      }]),
    });
  }

  if (rootMetadata !== null && !rootMetadata.isDirectory()) {
    throw new CliError('output_exists', 'The directory output path is not a directory.');
  }
  const destinations = [];
  const destinationKeys = new Set();
  const sourceKeys = new Set(inputs.map((input) => resolve(input.absolutePath).toLowerCase()));
  for (const input of inputs) {
    const suffixLength = input.sourceExtension.length;
    const relativeDestination = `${input.relativePath.slice(0, -suffixLength)}.${format}`;
    const absoluteDestination = resolve(
      absoluteOutput,
      ...relativeDestination.split('/'),
    );
    if (!isWithin(absoluteOutput, absoluteDestination)) {
      throw new CliError('output_collision', 'An output path escaped its directory root.');
    }
    const destinationKey = absoluteDestination.toLowerCase();
    if (destinationKeys.has(destinationKey) || sourceKeys.has(destinationKey)) {
      throw new CliError('output_collision', 'Multiple sources resolve to the same output path.');
    }
    destinationKeys.add(destinationKey);
    await rejectSymlinkSegments(
      absoluteDestination,
      fileSystem,
      'output_symlink_rejected',
      'output_write_failed',
    );
    const metadata = await lstatOrNull(fileSystem, absoluteDestination, 'output_write_failed');
    if (metadata !== null && (!metadata.isFile() || !overwrite)) {
      throw new CliError('output_exists', 'An output file already exists.');
    }
    destinations.push({
      input,
      absolutePath: absoluteDestination,
      outputPath: relativeDestination,
    });
  }
  return Object.freeze({
    rootPath: absoluteOutput,
    destinations: freezeRecords(destinations),
  });
}

/**
 * Publish one artifact with exclusive creation or atomic replacement.
 *
 * @param {Readonly<{absolutePath: string}>} destination - Preflighted destination.
 * @param {Uint8Array} bytes - Artifact bytes.
 * @param {boolean} overwrite - Whether to replace an existing regular file.
 * @param {object} fileSystem - Adapter exposing `mkdir`, `open`, `rename`, `unlink`, `lstat`, and optional `randomId`.
 * @returns {Promise<Readonly<{absolutePath: string, byteLength: number}>>} Frozen publication receipt.
 * @throws {CliError} When the destination is unsafe or publication fails.
 */
export async function publishArtifact(destination, bytes, overwrite, fileSystem) {
  if (
    destination === null ||
    typeof destination !== 'object' ||
    typeof destination.absolutePath !== 'string' ||
    !(bytes instanceof Uint8Array)
  ) {
    throw new CliError('output_write_failed', 'Artifact publication inputs are invalid.');
  }
  const payload = Buffer.from(bytes);
  const parent = dirname(destination.absolutePath);
  try {
    await fileSystem.mkdir(parent, { recursive: true });
  } catch {
    throw new CliError('output_write_failed', 'The output directory could not be created.');
  }
  await rejectSymlinkSegments(
    destination.absolutePath,
    fileSystem,
    'output_symlink_rejected',
    'output_write_failed',
  );

  if (!overwrite) {
    let handle = null;
    let created = false;
    try {
      handle = await fileSystem.open(destination.absolutePath, 'wx', 0o600);
      created = true;
      await handle.writeFile(payload);
      await handle.sync();
      await handle.close();
      handle = null;
    } catch (error) {
      if (handle !== null) {
        try {
          await handle.close();
        } catch {
          // The original publication failure remains authoritative.
        }
      }
      if (created) {
        try {
          await fileSystem.unlink(destination.absolutePath);
        } catch {
          // Best-effort cleanup must not replace the original safe error.
        }
      }
      if (hasErrorCode(error, 'EEXIST')) {
        throw new CliError('output_exists', 'The output path already exists.');
      }
      throw new CliError('output_write_failed', 'The output file could not be written.');
    }
    return Object.freeze({
      absolutePath: destination.absolutePath,
      byteLength: payload.byteLength,
    });
  }

  const identifier = typeof fileSystem.randomId === 'function'
    ? fileSystem.randomId()
    : randomUUID();
  const safeIdentifier = String(identifier).replace(/[^A-Za-z0-9._-]/gu, '_');
  const temporaryPath = `${destination.absolutePath}.tmp-${safeIdentifier}`;
  let handle = null;
  try {
    handle = await fileSystem.open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(payload);
    await handle.sync();
    await handle.close();
    handle = null;
    await fileSystem.rename(temporaryPath, destination.absolutePath);
  } catch {
    if (handle !== null) {
      try {
        await handle.close();
      } catch {
        // The original publication failure remains authoritative.
      }
    }
    throw new CliError('output_write_failed', 'The output file could not be replaced.');
  } finally {
    try {
      await fileSystem.unlink(temporaryPath);
    } catch (error) {
      if (!hasErrorCode(error, 'ENOENT')) {
        // Cleanup is best effort because the primary operation is already known.
      }
    }
  }
  return Object.freeze({
    absolutePath: destination.absolutePath,
    byteLength: payload.byteLength,
  });
}
