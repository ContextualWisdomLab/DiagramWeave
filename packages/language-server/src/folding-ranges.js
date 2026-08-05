import { languageServerLimits } from './limits.js';
import { documentSymbolsForSource } from './symbols.js';

const emptyFoldingRanges = Object.freeze([]);

/**
 * Create immutable LSP folding ranges from proven package and namespace scopes.
 *
 * The authoritative document-symbol scanner owns all PlantUML declaration,
 * comment, delimiter, UTF-16, hierarchy, source-size, symbol-count, and
 * malformed-source decisions. This adapter walks that frozen tree iteratively
 * in source pre-order and returns only line-based package or namespace folds
 * that contain at least one interior line. Character offsets, custom kinds, and
 * collapsed labels are deliberately omitted so line-only and character-aware
 * clients receive the same deterministic contract.
 *
 * `rangeLimit` is an already validated nonnegative client preference. Output is
 * additionally bounded by the scanner's total symbol ceiling. A zero limit or
 * a document without proven nonempty grouping scopes returns one shared frozen
 * empty collection.
 *
 * @param {unknown} source - Complete PlantUML source snapshot.
 * @param {number} [rangeLimit] - Validated nonnegative preferred result count.
 * @returns {readonly Readonly<{startLine: number, endLine: number}>[]} Frozen source-order ranges.
 */
export function foldingRangesForSource(
  source,
  rangeLimit = languageServerLimits.maxDocumentSymbols,
) {
  if (rangeLimit === 0) {
    return emptyFoldingRanges;
  }

  const roots = documentSymbolsForSource(source);
  const result = [];
  const stack = [...roots].reverse();
  const effectiveLimit = Math.min(
    rangeLimit,
    languageServerLimits.maxDocumentSymbols,
  );

  while (stack.length > 0 && result.length < effectiveLimit) {
    const symbol = stack.pop();
    if (
      (symbol.detail === 'package' || symbol.detail === 'namespace') &&
      symbol.range.end.line >= symbol.range.start.line + 2
    ) {
      result.push(Object.freeze({
        startLine: symbol.range.start.line,
        endLine: symbol.range.end.line,
      }));
    }

    const children = symbol.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }

  return result.length === 0 ? emptyFoldingRanges : Object.freeze(result);
}
