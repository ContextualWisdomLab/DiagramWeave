/**
 * Convert a trusted document-symbol tree into legacy-compatible symbol information.
 *
 * The adapter walks the bounded tree iteratively in source pre-order. It reuses
 * already frozen LSP ranges while owning and freezing every new location,
 * symbol-information record, traversal frame, and result array. Root symbols
 * omit `containerName`; descendants name only their immediate parent.
 *
 * @param {string} uri - Validated local document URI.
 * @param {readonly Readonly<object>[]} symbols - Trusted frozen root symbols.
 * @returns {readonly Readonly<object>[]} Deeply frozen source-order symbol information.
 */
export function symbolInformationForDocument(uri, symbols) {
  const result = [];
  const stack = [];
  for (let index = symbols.length - 1; index >= 0; index -= 1) {
    stack.push(Object.freeze({ symbol: symbols[index], containerName: null }));
  }
  while (stack.length > 0) {
    const { symbol, containerName } = stack.pop();
    const item = {
      name: symbol.name,
      kind: symbol.kind,
      location: Object.freeze({ uri, range: symbol.range }),
    };
    if (containerName !== null) {
      item.containerName = containerName;
    }
    result.push(Object.freeze(item));
    const children = symbol.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(Object.freeze({
        symbol: children[index],
        containerName: symbol.name,
      }));
    }
  }
  return Object.freeze(result);
}
