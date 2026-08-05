import assert from 'node:assert/strict';
import test from 'node:test';

import { documentSymbolsForSource } from '../src/symbols.js';

/**
 * Flatten a bounded document-symbol tree without recursive traversal.
 *
 * @param {readonly Readonly<object>[]} roots - Document-symbol roots.
 * @returns {Readonly<object>[]} Symbols in pre-order.
 */
function flattenSymbols(roots) {
  const flattened = [];
  const stack = [...roots].reverse();
  while (stack.length > 0) {
    const symbol = stack.pop();
    flattened.push(symbol);
    const children = symbol.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }
  return flattened;
}

test('builds a deeply frozen declaration hierarchy from complete matched scopes', () => {
  const source = [
    '@startuml',
    'package "Platform 😀" {',
    '  namespace api {',
    '    class Gateway',
    '    interface Port',
    '  }',
    '  class RootPeer',
    '}',
    'class External',
    '@enduml',
  ].join('\n');

  const roots = documentSymbolsForSource(source);
  assert.deepEqual(roots.map(({ name }) => name), ['Platform 😀', 'External']);
  assert.deepEqual(roots[0].children.map(({ name }) => name), ['api', 'RootPeer']);
  assert.deepEqual(roots[0].children[0].children.map(({ name }) => name), [
    'Gateway',
    'Port',
  ]);
  assert.equal(roots[0].children[1].children, undefined);
  assert.equal(roots[1].children, undefined);

  assert.deepEqual(roots[0].range, {
    start: { line: 1, character: 0 },
    end: { line: 7, character: 1 },
  });
  assert.deepEqual(roots[0].children[0].range, {
    start: { line: 2, character: 2 },
    end: { line: 5, character: 3 },
  });
  assert.deepEqual(roots[0].selectionRange, {
    start: { line: 1, character: 9 },
    end: { line: 1, character: 20 },
  });

  assert.equal(Object.isFrozen(roots), true);
  for (const symbol of flattenSymbols(roots)) {
    assert.equal(Object.isFrozen(symbol), true);
    assert.equal(Object.isFrozen(symbol.range), true);
    assert.equal(Object.isFrozen(symbol.range.start), true);
    assert.equal(Object.isFrozen(symbol.range.end), true);
    assert.equal(Object.isFrozen(symbol.selectionRange), true);
    if (symbol.children !== undefined) {
      assert.equal(Object.isFrozen(symbol.children), true);
      for (const child of symbol.children) {
        assert.equal(symbol.range.start.line <= child.range.start.line, true);
        assert.equal(child.range.end.line <= symbol.range.end.line, true);
      }
    }
  }
});

test('uses only complete indentation-matched unquoted declaration scopes', () => {
  const source = [
    '}',
    'package "Quoted { Label" as Quoted',
    'package "Escaped \\" { label" as Escaped',
    "package Commented ' {",
    'package OneLine { }',
    'package UnmatchedOuter {',
    '  namespace ProvenInner {',
    '    class ProvenChild',
    "  } ' close inner",
    '  class NotOwnedByOuter',
    'package Multi {{',
    '  class NotOwnedByMulti',
    '}',
    'package CrossIndent {',
    '  class NotOwnedByCrossIndent',
    '  }',
    'package Valid {',
    '  class Nested',
    "} ' close valid",
  ].join('\r\n');

  const roots = documentSymbolsForSource(source);
  assert.deepEqual(roots.map(({ name }) => name), [
    'Quoted { Label',
    'Escaped \\" { label',
    'Commented',
    'OneLine',
    'UnmatchedOuter',
    'ProvenInner',
    'NotOwnedByOuter',
    'Multi',
    'NotOwnedByMulti',
    'CrossIndent',
    'NotOwnedByCrossIndent',
    'Valid',
  ]);
  assert.deepEqual(roots[5].children.map(({ name }) => name), ['ProvenChild']);
  assert.deepEqual(roots[11].children.map(({ name }) => name), ['Nested']);

  for (const index of [0, 1, 2, 3, 4, 6, 7, 8, 9, 10]) {
    assert.equal(roots[index].children, undefined);
  }
  assert.deepEqual(roots[5].range.end, { line: 8, character: 17 });
  assert.deepEqual(roots[11].range.end, { line: 18, character: 15 });
});

test('constructs a deep bounded hierarchy without recursive product traversal', () => {
  const depth = 512;
  const lines = [];
  for (let index = 0; index < depth; index += 1) {
    lines.push(`${'  '.repeat(index)}package Scope${index} {`);
  }
  lines.push(`${'  '.repeat(depth)}class Leaf`);
  for (let index = depth - 1; index >= 0; index -= 1) {
    lines.push(`${'  '.repeat(index)}}`);
  }

  const roots = documentSymbolsForSource(lines.join('\r'));
  assert.equal(roots.length, 1);
  let current = roots[0];
  for (let index = 0; index < depth; index += 1) {
    assert.equal(current.name, `Scope${index}`);
    assert.equal(current.children.length, 1);
    current = current.children[0];
  }
  assert.equal(current.name, 'Leaf');
  assert.equal(current.children, undefined);
  assert.equal(flattenSymbols(roots).length, depth + 1);
});
