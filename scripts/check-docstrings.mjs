/**
 * Enforce JSDoc immediately before production exports.
 *
 * This deliberately small checker covers the foundation's explicit export
 * style. It fails if an exported function, class, or constant in a package
 * source file is not preceded by a block that starts with `/**`.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Recursively collect production JavaScript files below `packages`.
 *
 * @param {string} directory - Directory to inspect.
 * @returns {Promise<string[]>} Sorted source module paths.
 */
async function collectSourceFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.js') && path.includes('/src/')) {
      files.push(path);
    }
  }
  return files.sort();
}

/**
 * Return exported declarations that are missing an immediately preceding JSDoc.
 *
 * @param {string} source - JavaScript module source.
 * @returns {string[]} Human-readable missing declaration lines.
 */
function missingExportDocstrings(source) {
  const lines = source.split('\n');
  const missing = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^export\s+(?:async\s+)?(?:function|class|const|let|var)\b/.test(line.trim())) {
      continue;
    }

    let cursor = index - 1;
    while (cursor >= 0 && lines[cursor].trim() === '') {
      cursor -= 1;
    }
    if (cursor < 0 || lines[cursor].trim() !== '*/') {
      missing.push(`${index + 1}: ${line.trim()}`);
      continue;
    }
    while (cursor >= 0 && !lines[cursor].trim().startsWith('/**')) {
      cursor -= 1;
    }
    if (cursor < 0) {
      missing.push(`${index + 1}: ${line.trim()}`);
    }
  }
  return missing;
}

const files = await collectSourceFiles('packages');
const failures = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  for (const missing of missingExportDocstrings(source)) {
    failures.push(`${file}:${missing}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`Missing production JSDoc:\n${failures.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`Docstring check passed for ${files.length} production modules.\n`);
