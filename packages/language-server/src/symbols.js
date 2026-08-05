import { Buffer } from 'node:buffer';

import { LanguageServerError } from './errors.js';
import { languageServerLimits } from './limits.js';

const declarationPattern = /^(\s*)(?:(abstract)\s+)?(package|namespace|class|interface|enum|annotation|entity|object|participant|actor|boundary|control|database|collections|queue|component|node|cloud|frame|folder|artifact|file|stack|storage|card|agent|rectangle|usecase|state)\b(.*)$/diu;
const standaloneClosingBracePattern = /^(\s*)[}]\s*$/u;
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
 * Return structural braces outside quoted labels in source order.
 *
 * Comments and supported delimited declaration labels must already be masked.
 * Escaped quotes and doubled quote forms use the same rules as label parsing,
 * so braces displayed inside quoted labels never create or close outline
 * scopes.
 *
 * @param {string} line - One masked source line.
 * @returns {string[]} Unquoted opening and closing brace characters.
 */
function structuralBraces(line) {
  const braces = [];
  let inQuote = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
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
      continue;
    }
    if (!inQuote && (character === '{' || character === '}')) {
      braces.push(character);
    }
  }
  return braces;
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
 * Replace one complete delimited label token with spaces.
 *
 * Every supported opening delimiter is one UTF-16 code unit. Masking the
 * delimiter and label body preserves later source coordinates while preventing
 * displayed braces from entering the structural scope stack.
 *
 * @param {string[]} characters - Mutable declaration remainder code units.
 * @param {{selectionStart: number, tokenEnd: number, delimited: boolean}|null} token - Parsed label token.
 * @returns {void}
 */
function maskDelimitedToken(characters, token) {
  if (token?.delimited === true) {
    characters.fill(' ', token.selectionStart - 1, token.tokenEnd);
  }
}

/**
 * Mask supported quoted, parenthesized, bracketed, and colon labels.
 *
 * Both the first declaration label and one token following `as` are considered.
 * This prevents malformed but parseable secondary labels from contributing
 * braces even when the first displayed token remains authoritative.
 *
 * @param {string} remainder - Declaration text following its keyword.
 * @returns {string} Same-length remainder with complete delimited labels masked.
 */
function maskDelimitedLabels(remainder) {
  const characters = remainder.split('');
  const first = parseLabelToken(remainder);
  if (first === null) {
    return remainder;
  }
  maskDelimitedToken(characters, first);
  const aliasMatch = /^\s+as\s+/diu.exec(remainder.slice(first.tokenEnd));
  if (aliasMatch !== null) {
    const secondStart = first.tokenEnd + aliasMatch[0].length;
    maskDelimitedToken(characters, parseLabelToken(remainder, secondStart));
  }
  return characters.join('');
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
 * Create one immutable multi-line LSP range.
 *
 * @param {number} startLine - Zero-based start line.
 * @param {number} startCharacter - Inclusive UTF-16 start.
 * @param {number} endLine - Zero-based end line.
 * @param {number} endCharacter - Exclusive UTF-16 end.
 * @returns {Readonly<object>} Frozen range and positions.
 */
function sourceRange(startLine, startCharacter, endLine, endCharacter) {
  return Object.freeze({
    start: position(startLine, startCharacter),
    end: position(endLine, endCharacter),
  });
}

/**
 * Assign declarations to the innermost complete matched scope.
 *
 * Matched brace intervals are properly nested because the structural brace
 * stack closes only its top entry. Unmatched declarations never enter the
 * active scope stack and therefore cannot acquire children accidentally.
 *
 * @param {object[]} records - Mutable bounded declaration records.
 * @returns {number[]} Root record indices in source order.
 */
function assignParents(records) {
  const rootIndices = [];
  const activeScopeIndices = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    while (
      activeScopeIndices.length > 0 &&
      record.lineIndex >= records[activeScopeIndices.at(-1)].closeLine
    ) {
      activeScopeIndices.pop();
    }
    if (activeScopeIndices.length === 0) {
      rootIndices.push(index);
    } else {
      records[activeScopeIndices.at(-1)].childIndices.push(index);
    }
    if (record.closeLine !== null) {
      activeScopeIndices.push(index);
    }
  }
  return rootIndices;
}

/**
 * Freeze bounded declaration records into a non-recursive DocumentSymbol tree.
 *
 * Children always occur later in source order than their parent, so reverse
 * construction guarantees that each child is frozen before its parent without
 * recursive traversal.
 *
 * @param {object[]} records - Mutable bounded declaration records.
 * @param {number[]} rootIndices - Root record indices in source order.
 * @returns {readonly Readonly<object>[]} Deeply frozen root symbols.
 */
function freezeSymbolTree(records, rootIndices) {
  const frozenSymbols = new Array(records.length);
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    const children = record.childIndices.length === 0
      ? null
      : Object.freeze(record.childIndices.map((childIndex) => frozenSymbols[childIndex]));
    const symbol = {
      name: record.name,
      detail: record.detail,
      kind: record.kind,
      range: sourceRange(
        record.lineIndex,
        record.lineStart,
        record.closeLine ?? record.lineIndex,
        record.closeCharacter ?? record.lineEnd,
      ),
      selectionRange: sourceRange(
        record.lineIndex,
        record.selectionStart,
        record.lineIndex,
        record.selectionEnd,
      ),
    };
    if (children !== null) {
      symbol.children = children;
    }
    frozenSymbols[index] = Object.freeze(symbol);
  }
  return Object.freeze(rootIndices.map((rootIndex) => frozenSymbols[rootIndex]));
}

/**
 * Create a deterministic hierarchical LSP DocumentSymbol outline.
 *
 * The conservative scanner recognizes documented explicit declaration keywords
 * across common class, sequence, component, use-case, state, and deployment
 * diagrams. Complete declaration scopes become hierarchy only when one
 * unquoted opening brace is closed in stack order by a standalone brace with
 * identical indentation. Ambiguous, unmatched, cross-indented, quoted,
 * delimited-label, and commented braces fail by omission. Line and selection
 * positions are JavaScript UTF-16 indices, matching the advertised LSP position
 * encoding.
 *
 * @param {unknown} source - Complete PlantUML source snapshot.
 * @returns {readonly Readonly<object>[]} Deeply frozen source-order root symbols.
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
  const records = [];
  const structuralStack = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const originalLine = lines[lineIndex];
    const code = maskComments(originalLine, commentState);
    const match = declarationPattern.exec(code);
    let recordIndex = -1;
    if (match !== null && (match[2] === undefined || match[3].toLowerCase() === 'class')) {
      const remainder = match[4];
      const label = selectDisplayLabel(remainder);
      if (label !== null && label.name.length > 0) {
        if (Buffer.byteLength(label.name, 'utf8') > languageServerLimits.maxSymbolNameBytes) {
          throw new LanguageServerError(
            'document_symbol_name_too_large',
            'A document symbol name exceeds the session limit.',
          );
        }
        if (records.length >= languageServerLimits.maxDocumentSymbols) {
          throw new LanguageServerError(
            'document_symbols_too_many',
            'The document contains too many explicit symbols.',
          );
        }
        const keyword = match[3].toLowerCase();
        const remainderStart = match.indices[4][0];
        recordIndex = records.length;
        records.push({
          name: label.name,
          detail: match[2] === undefined ? keyword : 'abstract class',
          kind: symbolKinds[keyword],
          lineIndex,
          lineStart: match[1].length,
          lineEnd: originalLine.length,
          selectionStart: remainderStart + label.selectionStart,
          selectionEnd: remainderStart + label.selectionEnd,
          indentation: match[1],
          closeLine: null,
          closeCharacter: null,
          childIndices: [],
        });
      }
    }

    const structuralCode = match === null
      ? code
      : `${code.slice(0, match.indices[4][0])}${maskDelimitedLabels(match[4])}`;
    const braces = structuralBraces(structuralCode);
    const scopeRecordIndex = recordIndex >= 0 && braces.length === 1 && braces[0] === '{'
      ? recordIndex
      : -1;
    const closingMatch = braces.length === 1 && braces[0] === '}'
      ? standaloneClosingBracePattern.exec(structuralCode)
      : null;
    for (const brace of braces) {
      if (brace === '{') {
        structuralStack.push(scopeRecordIndex);
        continue;
      }
      const openingRecordIndex = structuralStack.pop() ?? -1;
      if (
        openingRecordIndex >= 0 &&
        closingMatch !== null &&
        closingMatch[1] === records[openingRecordIndex].indentation
      ) {
        records[openingRecordIndex].closeLine = lineIndex;
        records[openingRecordIndex].closeCharacter = originalLine.length;
      }
    }
  }

  return freezeSymbolTree(records, assignParents(records));
}
