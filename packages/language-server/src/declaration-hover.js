import { isPlainRecord } from './contracts.js';
import { LanguageServerError } from './errors.js';
import { documentSymbolsForSource } from './symbols.js';

const supportedMarkupKinds = new Set(['markdown', 'plaintext']);

/**
 * Create the stable error used for malformed or out-of-document hover positions.
 *
 * @returns {LanguageServerError} Source-free public position error.
 */
function invalidPositionError() {
  return new LanguageServerError(
    'document_position_invalid',
    'The document position is invalid.',
    { field: 'position', method: 'textDocument/hover' },
  );
}

/**
 * Copy and validate one UTF-16 hover position against a complete source snapshot.
 *
 * A position may point at the end of a source line because LSP positions use an
 * exclusive character boundary. Caller-owned and hostile objects are never
 * retained, and dynamic property failures collapse to one source-free error.
 *
 * @param {string} source - Authoritatively validated PlantUML source.
 * @param {unknown} candidate - Candidate LSP position.
 * @returns {Readonly<{line: number, character: number}>} Frozen valid position.
 * @throws {LanguageServerError} When the position is malformed or outside source.
 */
function normalizePosition(source, candidate) {
  try {
    if (!isPlainRecord(candidate)) {
      throw new Error('invalid position record');
    }
    const line = candidate.line;
    const character = candidate.character;
    const lines = source.split(/\r\n|\n|\r/u);
    if (
      !Number.isSafeInteger(line) ||
      !Number.isSafeInteger(character) ||
      line < 0 ||
      character < 0 ||
      line >= lines.length ||
      character > lines[line].length
    ) {
      throw new Error('position outside source');
    }
    return Object.freeze({ line, character });
  } catch {
    throw invalidPositionError();
  }
}

/**
 * Return the longest contiguous backtick run in one bounded hover value.
 *
 * @param {string} value - Plaintext hover content.
 * @returns {number} Maximum contiguous backtick count.
 */
function longestBacktickRun(value) {
  let longest = 0;
  let current = 0;
  for (const character of value) {
    if (character === '`') {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

/**
 * Place plaintext in a Markdown fence that dynamic labels cannot terminate.
 *
 * @param {string} value - Plaintext declaration evidence.
 * @returns {string} Markdown text-code block.
 */
function markdownValue(value) {
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(value) + 1));
  return `${fence}text\n${value}\n${fence}`;
}

/**
 * Return whether one position lies inside a symbol's exact selection range.
 *
 * Declaration selections are single-line UTF-16 ranges. The start is inclusive
 * and the end is exclusive, matching the Language Server Protocol.
 *
 * @param {Readonly<object>} symbol - Authoritative document symbol.
 * @param {Readonly<{line: number, character: number}>} position - Valid position.
 * @returns {boolean} True only inside the explicit declaration label.
 */
function selectionContains(symbol, position) {
  return position.line === symbol.selectionRange.start.line &&
    position.line === symbol.selectionRange.end.line &&
    position.character >= symbol.selectionRange.start.character &&
    position.character < symbol.selectionRange.end.character;
}

/**
 * Build one deeply frozen declaration hover from authoritative symbol evidence.
 *
 * @param {Readonly<object>} symbol - Matched authoritative document symbol.
 * @param {string|null} parentName - Immediate proven grouping-container name.
 * @param {'markdown'|'plaintext'} markupKind - Negotiated LSP markup kind.
 * @returns {Readonly<object>} Deeply frozen LSP Hover record.
 */
function hoverForSymbol(symbol, parentName, markupKind) {
  const lines = [
    `PlantUML ${symbol.detail} declaration`,
    `Name: ${symbol.name}`,
  ];
  if (parentName !== null) {
    lines.push(`Container: ${parentName}`);
  }
  const plaintext = lines.join('\n');
  const value = markupKind === 'markdown' ? markdownValue(plaintext) : plaintext;
  return Object.freeze({
    contents: Object.freeze({ kind: markupKind, value }),
    range: symbol.selectionRange,
  });
}

/**
 * Create deterministic hover evidence for an explicit PlantUML declaration.
 *
 * The function reuses the authoritative document-symbol tree and walks it
 * iteratively in source preorder. It returns a hover only when the cursor lies
 * inside one exact declaration-label selection range. Relation endpoints,
 * members, comments, directives, malformed syntax, and every other ambiguous
 * position fail by omission. No renderer, LLM, file, include, macro, workspace,
 * shell, or network operation is performed.
 *
 * @param {unknown} source - Complete PlantUML source snapshot.
 * @param {unknown} position - Candidate zero-based UTF-16 LSP position.
 * @param {unknown} markupKind - Negotiated `plaintext` or `markdown` kind.
 * @returns {Readonly<object>|null} Frozen LSP Hover or null when no label matches.
 * @throws {LanguageServerError} When source, position, or markup contracts fail.
 */
export function declarationHoverForSource(source, position, markupKind) {
  const symbols = documentSymbolsForSource(source);
  if (typeof markupKind !== 'string' || !supportedMarkupKinds.has(markupKind)) {
    throw new LanguageServerError(
      'invalid_request',
      'The hover markup kind is invalid.',
      { field: 'markupKind', method: 'textDocument/hover' },
    );
  }
  const normalizedPosition = normalizePosition(source, position);
  const stack = [];
  for (let index = symbols.length - 1; index >= 0; index -= 1) {
    stack.push(Object.freeze({ symbol: symbols[index], parentName: null }));
  }

  while (stack.length > 0) {
    const { symbol, parentName } = stack.pop();
    if (selectionContains(symbol, normalizedPosition)) {
      return hoverForSymbol(symbol, parentName, markupKind);
    }
    if (symbol.children !== undefined) {
      for (let index = symbol.children.length - 1; index >= 0; index -= 1) {
        stack.push(Object.freeze({
          symbol: symbol.children[index],
          parentName: symbol.name,
        }));
      }
    }
  }
  return null;
}
