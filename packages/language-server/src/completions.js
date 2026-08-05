import { Buffer } from 'node:buffer';

import { isPlainRecord } from './contracts.js';
import { LanguageServerError } from './errors.js';
import { languageServerLimits } from './limits.js';

const completionCatalog = Object.freeze([
  '@startuml', '@enduml', 'package', 'namespace', 'class', 'interface',
  'enum', 'annotation', 'entity', 'object', 'participant', 'actor',
  'boundary', 'control', 'database', 'collections', 'queue', 'component',
  'node', 'cloud', 'frame', 'folder', 'artifact', 'file', 'stack',
  'storage', 'card', 'agent', 'rectangle', 'usecase', 'state',
  'abstract class',
]);
const emptyCompletionItems = Object.freeze([]);
const identifierContinuation = /[\p{L}\p{N}_@]/u;

/**
 * Mask PlantUML comments without changing UTF-16 line length.
 *
 * @param {string} line - One line or line prefix.
 * @param {{inBlockComment: boolean}} state - Cross-line comment state.
 * @returns {{masked: string, sawComment: boolean}} Masked line and comment flag.
 */
function maskComments(line, state) {
  const characters = line.split('');
  let inQuote = false;
  let sawComment = state.inBlockComment;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const next = characters[index + 1];
    if (state.inBlockComment) {
      characters[index] = ' ';
      if (character === "'" && next === '/') {
        characters[index + 1] = ' ';
        state.inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (!inQuote && character === '/' && next === "'") {
      characters[index] = ' ';
      characters[index + 1] = ' ';
      state.inBlockComment = true;
      sawComment = true;
      index += 1;
      continue;
    }
    if (!inQuote && character === "'") {
      characters.fill(' ', index);
      sawComment = true;
      break;
    }
    if (character === '"') {
      if (inQuote && next === '"') {
        index += 1;
        continue;
      }
      let backslashes = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) {
        backslashes += 1;
      }
      if (backslashes % 2 === 0) {
        inQuote = !inQuote;
      }
    }
  }
  return { masked: characters.join(''), sawComment };
}

/**
 * Create one frozen LSP position.
 *
 * @param {number} line - Zero-based line.
 * @param {number} character - Zero-based UTF-16 character offset.
 * @returns {Readonly<{line: number, character: number}>} Frozen position.
 */
function position(line, character) {
  return Object.freeze({ line, character });
}

/**
 * Create one frozen declaration-keyword completion item.
 *
 * @param {string} keyword - PlantUML keyword.
 * @param {number} catalogIndex - Stable catalog index.
 * @param {number} line - Completion line.
 * @param {number} startCharacter - Prefix start.
 * @param {number} endCharacter - Cursor offset.
 * @returns {Readonly<object>} Deeply frozen CompletionItem.
 */
function completionItem(keyword, catalogIndex, line, startCharacter, endCharacter) {
  const range = Object.freeze({
    start: position(line, startCharacter),
    end: position(line, endCharacter),
  });
  return Object.freeze({
    label: keyword,
    kind: 14,
    detail: 'PlantUML declaration keyword',
    sortText: String(catalogIndex).padStart(3, '0'),
    filterText: keyword,
    insertTextFormat: 1,
    textEdit: Object.freeze({ range, newText: keyword }),
  });
}

/**
 * Return deterministic PlantUML declaration completions for one UTF-16 position.
 *
 * @param {unknown} source - Complete source snapshot.
 * @param {unknown} completionPosition - LSP position.
 * @returns {readonly Readonly<object>[]} Frozen completion items.
 * @throws {LanguageServerError} When source or position contracts fail.
 */
export function completionItemsForSource(source, completionPosition) {
  if (typeof source !== 'string') {
    throw new LanguageServerError('document_text_invalid', 'Document text must be a string.', {
      field: 'text',
    });
  }
  if (Buffer.byteLength(source, 'utf8') > languageServerLimits.maxDocumentBytes) {
    throw new LanguageServerError('document_too_large', 'The document exceeds the session limit.', {
      field: 'text',
    });
  }

  let lineIndex;
  let character;
  try {
    if (!isPlainRecord(completionPosition)) {
      throw new Error('invalid position');
    }
    lineIndex = completionPosition.line;
    character = completionPosition.character;
  } catch {
    throw new LanguageServerError('document_position_invalid', 'The document position is invalid.', {
      field: 'position',
    });
  }

  const lines = source.split(/\r\n|\n|\r/u);
  if (
    !Number.isSafeInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length ||
    !Number.isSafeInteger(character) || character < 0 || character > lines[lineIndex].length
  ) {
    throw new LanguageServerError('document_position_invalid', 'The document position is invalid.', {
      field: 'position',
    });
  }

  const line = lines[lineIndex];
  const nextCharacter = line[character];
  if (nextCharacter !== undefined && identifierContinuation.test(nextCharacter)) {
    return emptyCompletionItems;
  }

  const commentState = { inBlockComment: false };
  for (let index = 0; index < lineIndex; index += 1) {
    maskComments(lines[index], commentState);
  }
  const prefixResult = maskComments(line.slice(0, character), commentState);
  if (prefixResult.sawComment || commentState.inBlockComment) {
    return emptyCompletionItems;
  }

  const prefixMatch = /^([ \t]*)([@A-Za-z][@A-Za-z ]*|)$/u.exec(prefixResult.masked);
  if (prefixMatch === null) {
    return emptyCompletionItems;
  }
  const indentation = prefixMatch[1].length;
  const typedPrefix = prefixMatch[2].toLowerCase();
  const items = [];
  for (let index = 0; index < completionCatalog.length; index += 1) {
    const keyword = completionCatalog[index];
    if (keyword.startsWith(typedPrefix)) {
      items.push(completionItem(keyword, index, lineIndex, indentation, character));
    }
  }
  return items.length === 0
    ? emptyCompletionItems
    : Object.freeze(items.slice(0, languageServerLimits.maxCompletionItems));
}
