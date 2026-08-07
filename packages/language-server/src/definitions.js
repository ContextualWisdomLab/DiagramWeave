import { Buffer } from 'node:buffer';

import {
  isPlainRecord,
  normalizeDocumentUri,
} from './contracts.js';
import { LanguageServerError } from './errors.js';
import { languageServerLimits } from './limits.js';
import { documentSymbolsForSource } from './symbols.js';

const declarationPattern = /^(\s*)(?:(abstract)\s+)?(package|namespace|class|interface|enum|annotation|entity|object|participant|actor|boundary|control|database|collections|queue|component|node|cloud|frame|folder|artifact|file|stack|storage|card|agent|rectangle|usecase|state)\b(.*)$/diu;
const safeIdentifierPattern = /^[\p{L}_][\p{L}\p{N}_.$-]*$/u;
const identifierTokenPattern = /[\p{L}_][\p{L}\p{N}_.$-]*/gu;
const relationOperatorPattern = /(?:<\|--|--\|>|<\|\.\.|\.\.\|>|<--|-->|<-|->|--|\.\.)/u;

/**
 * Create the stable error used for malformed or out-of-document definition positions.
 *
 * @returns {LanguageServerError} Source-free public position error.
 */
function invalidPositionError() {
  return new LanguageServerError(
    'document_position_invalid',
    'The document position is invalid.',
    { field: 'position', method: 'textDocument/definition' },
  );
}

/**
 * Copy and validate one UTF-16 definition position against a complete source snapshot.
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
 * Parse one quoted or paired-delimiter declaration token.
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
 * Parse one conservative PlantUML declaration label or alias token.
 *
 * @param {string} value - Declaration remainder.
 * @param {number} [from] - Search offset.
 * @returns {{name: string, selectionStart: number, selectionEnd: number, tokenEnd: number, delimited: boolean}|null} Parsed token.
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
 * Return whether a token is a bounded identifier supported by this definition slice.
 *
 * @param {{name: string, delimited: boolean}|null} token - Parsed declaration token.
 * @returns {boolean} True only for a safe bare identifier.
 */
function isSafeIdentifierToken(token) {
  return token !== null &&
    token.delimited === false &&
    safeIdentifierPattern.test(token.name) &&
    Buffer.byteLength(token.name, 'utf8') <= languageServerLimits.maxSymbolNameBytes;
}

/**
 * Derive one conservative reference identifier from an authoritative declaration.
 *
 * The line and symbol are produced by the same document-symbol scanner and therefore
 * share its declaration pattern, first-token, single-line selection, and exact range
 * invariants. This layer derives an identifier only; it does not revalidate or create
 * a second declaration source of truth.
 *
 * @param {string} line - Complete authoritative declaration line.
 * @param {Readonly<object>} symbol - Authoritative symbol on this line.
 * @returns {{identifier: string, identifierRange: Readonly<object>, target: Readonly<object>}|null} Identifier record.
 */
function identifierForSymbol(line, symbol) {
  const match = declarationPattern.exec(line);
  const remainder = match[4];
  const remainderStart = match.indices[4][0];
  const first = parseLabelToken(remainder);
  const aliasMatch = /^\s+as\s+/diu.exec(remainder.slice(first.tokenEnd));
  const second = aliasMatch === null
    ? null
    : parseLabelToken(remainder, first.tokenEnd + aliasMatch[0].length);

  let identifier = null;
  if (aliasMatch === null && isSafeIdentifierToken(first)) {
    identifier = first;
  } else if (aliasMatch !== null && first.delimited && isSafeIdentifierToken(second)) {
    identifier = second;
  } else if (aliasMatch !== null && isSafeIdentifierToken(first) && second?.delimited === true) {
    identifier = first;
  }
  if (identifier === null) {
    return null;
  }

  return {
    identifier: identifier.name,
    identifierRange: Object.freeze({
      start: Object.freeze({
        line: symbol.selectionRange.start.line,
        character: remainderStart + identifier.selectionStart,
      }),
      end: Object.freeze({
        line: symbol.selectionRange.start.line,
        character: remainderStart + identifier.selectionEnd,
      }),
    }),
    target: symbol,
  };
}

/**
 * Flatten one bounded authoritative symbol tree without recursion.
 *
 * @param {readonly Readonly<object>[]} roots - Authoritative root symbols.
 * @returns {Readonly<object>[]} Source-order flattened symbols.
 */
function flattenSymbols(roots) {
  const flattened = [];
  const stack = [];
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    stack.push(roots[index]);
  }
  while (stack.length > 0) {
    const symbol = stack.pop();
    flattened.push(symbol);
    if (symbol.children !== undefined) {
      for (let index = symbol.children.length - 1; index >= 0; index -= 1) {
        stack.push(symbol.children[index]);
      }
    }
  }
  return flattened;
}

/**
 * Return whether one position lies in a single-line UTF-16 range.
 *
 * @param {Readonly<object>} range - Candidate single-line range.
 * @param {Readonly<{line: number, character: number}>} position - Valid position.
 * @returns {boolean} True for an inclusive start and exclusive end match.
 */
function rangeContains(range, position) {
  return position.line === range.start.line &&
    position.line === range.end.line &&
    position.character >= range.start.character &&
    position.character < range.end.character;
}

/**
 * Mask comments and quoted narrative while preserving UTF-16 offsets.
 *
 * @param {string} line - One source line.
 * @param {{inBlockComment: boolean}} state - Cross-line block-comment state.
 * @returns {string} Same-length structural line.
 */
function maskUntrustedText(line, state) {
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
      characters[index] = ' ';
      if (inQuote && next === '"') {
        characters[index + 1] = ' ';
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
      continue;
    }
    if (inQuote) {
      characters[index] = ' ';
    }
  }
  return characters.join('');
}

/**
 * Return the target line with preceding block-comment state applied.
 *
 * @param {string[]} lines - Complete source lines.
 * @param {number} targetLine - Requested line index.
 * @returns {string} Same-length masked target line.
 */
function maskedTargetLine(lines, targetLine) {
  const state = { inBlockComment: false };
  let masked = '';
  for (let index = 0; index <= targetLine; index += 1) {
    masked = maskUntrustedText(lines[index], state);
  }
  return masked;
}

/**
 * Return the structural portion before a relation or member label separator.
 *
 * @param {string} line - Comment- and quote-masked line.
 * @returns {{segment: string, navigable: boolean}} Bounded structural segment.
 */
function structuralSegmentForLine(line) {
  const trimmedStart = line.trimStart();
  if (trimmedStart.startsWith('@') || trimmedStart.startsWith('!')) {
    return { segment: '', navigable: false };
  }
  const colon = line.indexOf(':');
  const segment = colon < 0 ? line : line.slice(0, colon);
  const ownerShorthand = colon >= 0 && safeIdentifierPattern.test(segment.trim());
  return {
    segment,
    navigable: relationOperatorPattern.test(segment) || ownerShorthand,
  };
}

/**
 * Build one immutable same-document definition location.
 *
 * @param {string} uri - Validated local document URI.
 * @param {Readonly<object>} symbol - Authoritative target symbol.
 * @returns {Readonly<object>} Frozen LSP Location.
 */
function locationForSymbol(uri, symbol) {
  return Object.freeze({ uri, range: symbol.selectionRange });
}

/**
 * Resolve one explicit same-document PlantUML identifier to its declaration.
 *
 * Declaration existence and target ranges come exclusively from the authoritative
 * document-symbol tree. A bounded alias parser derives only safe bare reference
 * identifiers from those proven declarations. Duplicate, malformed, implicit,
 * commented, quoted, directive, label, include, macro, renderer-dependent, or
 * otherwise ambiguous syntax fails by omission. The function performs no LLM,
 * renderer, file, workspace, shell, include, macro, or network operation.
 *
 * @param {unknown} source - Complete PlantUML source snapshot.
 * @param {unknown} uri - Local PlantUML document URI.
 * @param {unknown} position - Candidate zero-based UTF-16 LSP position.
 * @returns {Readonly<object>|null} Frozen same-document LSP Location or null.
 * @throws {LanguageServerError} When source, URI, or position contracts fail.
 */
export function definitionForSource(source, uri, position) {
  const roots = documentSymbolsForSource(source);
  const normalizedUri = normalizeDocumentUri(uri);
  const normalizedPosition = normalizePosition(source, position);
  const lines = source.split(/\r\n|\n|\r/u);
  const symbols = flattenSymbols(roots);
  const identifierRecords = [];
  const targetsByIdentifier = new Map();

  for (const symbol of symbols) {
    if (rangeContains(symbol.selectionRange, normalizedPosition)) {
      return locationForSymbol(normalizedUri, symbol);
    }
    const identifierRecord = identifierForSymbol(
      lines[symbol.selectionRange.start.line],
      symbol,
    );
    if (identifierRecord === null) {
      continue;
    }
    identifierRecords.push(identifierRecord);
    if (!targetsByIdentifier.has(identifierRecord.identifier)) {
      targetsByIdentifier.set(identifierRecord.identifier, identifierRecord.target);
    } else {
      targetsByIdentifier.set(identifierRecord.identifier, null);
    }
  }

  for (const record of identifierRecords) {
    if (rangeContains(record.identifierRange, normalizedPosition)) {
      return locationForSymbol(normalizedUri, record.target);
    }
  }

  const { segment, navigable } = structuralSegmentForLine(
    maskedTargetLine(lines, normalizedPosition.line),
  );
  if (!navigable || normalizedPosition.character >= segment.length) {
    return null;
  }

  identifierTokenPattern.lastIndex = 0;
  let match;
  while ((match = identifierTokenPattern.exec(segment)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (
      normalizedPosition.character >= start &&
      normalizedPosition.character < end
    ) {
      const target = targetsByIdentifier.get(match[0]);
      return target === undefined || target === null
        ? null
        : locationForSymbol(normalizedUri, target);
    }
  }
  return null;
}
