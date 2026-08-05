import { Buffer } from 'node:buffer';

import { LanguageServerError } from './errors.js';
import { languageServerLimits } from './limits.js';

const declarationPattern = /^(\s*)(?:(abstract)\s+)?(package|namespace|class|interface|enum|annotation|entity|object|participant|actor|boundary|control|database|collections|queue|component|node|cloud|frame|folder|artifact|file|stack|storage|card|agent|rectangle|usecase|state)\b(.*)$/diu;
const symbolKinds = Object.freeze({
  package: 4,
  namespace: 3,
  class: 5,
  interface: 11,
  enum: 10,
  annotation: 23,
  entity: 19,
  object: 19,
  participant: 19,
  actor: 19,
  boundary: 19,
  control: 19,
  database: 19,
  collections: 18,
  queue: 19,
  component: 2,
  node: 19,
  cloud: 19,
  frame: 19,
  folder: 19,
  artifact: 1,
  file: 1,
  stack: 19,
  storage: 19,
  card: 19,
  agent: 19,
  rectangle: 19,
  usecase: 12,
  state: 24,
});

/**
 * Replace PlantUML comments with spaces while preserving UTF-16 line offsets.
 *
 * `String.prototype.split('')` deliberately operates on UTF-16 code units, the
 * same coordinate system advertised by the Language Server. Code-point spread
 * would collapse surrogate pairs and shift every selection after an emoji.
 *
 * @param {string} line - One source line without its newline delimiter.
 * @param {{inBlockComment: boolean}} state - Mutable cross-line block-comment state.
 * @returns {string} Same-length source line with comments masked.
 */
function maskComments(line, state) {
  const characters = line.split('');
  let inQuote = false;
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
      index += 1;
      continue;
    }
    if (!inQuote && character === "'") {
      characters.fill(' ', index);
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
  return characters.join('');
}

/**
 * Parse one quoted or paired-delimiter label token.
 *
 * @param {string} value - Declaration remainder.
 * @param {number} start - First non-whitespace index.
 * @param {string} opening - Opening delimiter.
 * @param {string} closing - Closing delimiter.
 * @returns {{name: string, selectionStart: number, selectionEnd: number, tokenEnd: number, delimited: true}|null} Parsed token.
 */
function parseDelimitedToken(value, start, opening, closing) {
  let cursor = start + opening.length;
  while (cursor < value.length) {
    if (opening === '"' && value[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (opening === '"' && value[cursor] === '"' && value[cursor + 1] === '"') {
      cursor += 2;
      continue;
    }
    if (value.startsWith(closing, cursor)) {
      return {
        name: value.slice(start + opening.length, cursor),
        selectionStart: start + opening.length,
        selectionEnd: cursor,
        tokenEnd: cursor + closing.length,
        delimited: true,
      };
    }
    cursor += 1;
  }
  return null;
}

/**
 * Parse one conservative PlantUML declaration label token.
 *
 * @param {string} value - Declaration remainder.
 * @param {number} [from] - Search offset.
 * @returns {{name: string, selectionStart: number, selectionEnd: number, tokenEnd: number, delimited: boolean}|null} Parsed label token.
 */
function parseLabelToken(value, from = 0) {
  let start = from;
  while (start < value.length && /\s/u.test(value[start])) {
    start += 1;
  }
  if (start >= value.length) {
    return null;
  }
  const delimiter = value[start];
  if (delimiter === '"') {
    return parseDelimitedToken(value, start, '"', '"');
  }
  if (delimiter === '(') {
    return parseDelimitedToken(value, start, '(', ')');
  }
  if (delimiter === '[') {
    return parseDelimitedToken(value, start, '[', ']');
  }
  if (delimiter === ':') {
    return parseDelimitedToken(value, start, ':', ':');
  }
  let end = start;
  while (end < value.length && !/[\s{#]/u.test(value[end])) {
    end += 1;
  }
  if (end === start || value[start] === '<') {
    return null;
  }
  return {
    name: value.slice(start, end),
    selectionStart: start,
    selectionEnd: end,
    tokenEnd: end,
    delimited: false,
  };
}

/**
 * Choose the displayed label from a declaration and optional `as` alias.
 *
 * A delimited first token is the display label. When the first token is bare
 * and the token after `as` is delimited, the second token is the display label.
 * Otherwise the first token remains authoritative.
 *
 * @param {string} remainder - Declaration text following its keyword.
 * @returns {{name: string, selectionStart: number, selectionEnd: number}|null} Selected label.
 */
function selectDisplayLabel(remainder) {
  const first = parseLabelToken(remainder);
  if (first === null) {
    return null;
  }
  if (first.delimited) {
    return first;
  }
  const aliasMatch = /^\s+as\s+/diu.exec(remainder.slice(first.tokenEnd));
  if (aliasMatch === null) {
    return first;
  }
  const secondStart = first.tokenEnd + aliasMatch[0].length;
  const second = parseLabelToken(remainder, secondStart);
  return second?.delimited === true ? second : first;
}

/**
 * Create one immutable UTF-16 LSP position.
 *
 * @param {number} line - Zero-based source line.
 * @param {number} character - Zero-based UTF-16 character offset.
 * @returns {Readonly<{line: number, character: number}>} Frozen position.
 */
function position(line, character) {
  return Object.freeze({ line, character });
}

/**
 * Create one immutable LSP range.
 *
 * @param {number} line - Zero-based source line.
 * @param {number} startCharacter - Inclusive UTF-16 start.
 * @param {number} endCharacter - Exclusive UTF-16 end.
 * @returns {Readonly<object>} Frozen range and positions.
 */
function range(line, startCharacter, endCharacter) {
  return Object.freeze({
    start: position(line, startCharacter),
    end: position(line, endCharacter),
  });
}

/**
 * Create a deterministic flat LSP DocumentSymbol outline for explicit PlantUML declarations.
 *
 * The conservative scanner recognizes documented explicit declaration keywords
 * across common class, sequence, component, use-case, state, and deployment
 * diagrams. It deliberately ignores implicit participants, relations,
 * directives, members, macros, and malformed labels rather than inventing
 * semantic structure. Line and selection positions are JavaScript UTF-16
 * indices, matching the session's advertised LSP position encoding.
 *
 * @param {unknown} source - Complete PlantUML source snapshot.
 * @returns {readonly Readonly<object>[]} Deeply frozen declaration-order symbols.
 * @throws {LanguageServerError} When source or bounded symbol contracts fail.
 */
export function documentSymbolsForSource(source) {
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
  const lines = source.split(/\r\n|\n|\r/u);
  const commentState = { inBlockComment: false };
  const symbols = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const originalLine = lines[lineIndex];
    const code = maskComments(originalLine, commentState);
    const match = declarationPattern.exec(code);
    if (match === null || (match[2] !== undefined && match[3].toLowerCase() !== 'class')) {
      continue;
    }
    const remainder = match[4];
    const label = selectDisplayLabel(remainder);
    if (label === null || label.name.length === 0) {
      continue;
    }
    if (Buffer.byteLength(label.name, 'utf8') > languageServerLimits.maxSymbolNameBytes) {
      throw new LanguageServerError(
        'document_symbol_name_too_large',
        'A document symbol name exceeds the session limit.',
      );
    }
    if (symbols.length >= languageServerLimits.maxDocumentSymbols) {
      throw new LanguageServerError(
        'document_symbols_too_many',
        'The document contains too many explicit symbols.',
      );
    }
    const keyword = match[3].toLowerCase();
    const detail = match[2] === undefined ? keyword : 'abstract class';
    const remainderStart = match.indices[4][0];
    const lineStart = match[1].length;
    const selectionStart = remainderStart + label.selectionStart;
    const selectionEnd = remainderStart + label.selectionEnd;
    symbols.push(Object.freeze({
      name: label.name,
      detail,
      kind: symbolKinds[keyword],
      range: range(lineIndex, lineStart, originalLine.length),
      selectionRange: range(lineIndex, selectionStart, selectionEnd),
    }));
  }
  return Object.freeze(symbols);
}
