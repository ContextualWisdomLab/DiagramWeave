/**
 * Validate every repository JavaScript module with Node's parser.
 *
 * The script avoids external lint dependencies during the zero-dependency
 * foundation phase and fails closed on unreadable directories or syntax errors.
 */
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const ignoredDirectories = new Set(['.git', 'node_modules']);

/**
 * Recursively collect JavaScript module paths below a directory.
 *
 * @param {string} directory - Absolute or repository-relative directory.
 * @returns {Promise<string[]>} Sorted JavaScript paths.
 */
async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJavaScriptFiles(path)));
    } else if (entry.isFile() && /\.(?:c|m)?js$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
}

const files = await collectJavaScriptFiles('.');
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(`Syntax check passed for ${files.length} JavaScript files.\n`);
