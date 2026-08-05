import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import { languageServerLimits } from '../src/limits.js';
import { documentSymbolsForSource } from '../src/symbols.js';

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

test('extracts deterministic explicit declarations across common PlantUML diagrams', () => {
  const source = [
    '@startuml',
    'package "Core Services" {',
    '  class Customer',
    '  abstract class "Order 😀" as Order',
    '  interface PaymentPort',
    '  enum Status',
    '}',
    'participant "사용자 😀" as User',
    'actor Admin',
    'component [API Gateway] as Api',
    'usecase (Submit Order) as UC',
    'state "Ready" as Ready',
    '@enduml',
  ].join('\n');

  const symbols = documentSymbolsForSource(source);
  assert.deepEqual(symbols.map(({ name, detail, kind }) => ({ name, detail, kind })), [
    { name: 'Core Services', detail: 'package', kind: 4 },
    { name: 'Customer', detail: 'class', kind: 5 },
    { name: 'Order 😀', detail: 'abstract class', kind: 5 },
    { name: 'PaymentPort', detail: 'interface', kind: 11 },
    { name: 'Status', detail: 'enum', kind: 10 },
    { name: '사용자 😀', detail: 'participant', kind: 19 },
    { name: 'Admin', detail: 'actor', kind: 19 },
    { name: 'API Gateway', detail: 'component', kind: 2 },
    { name: 'Submit Order', detail: 'usecase', kind: 12 },
    { name: 'Ready', detail: 'state', kind: 24 },
  ]);
  assert.deepEqual(symbols.map(({ range }) => range.start.line), [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]);
  assert.deepEqual(symbols[5].selectionRange, {
    start: { line: 7, character: 13 },
    end: { line: 7, character: 19 },
  });
  assert.equal(Object.isFrozen(symbols), true);
  for (const symbol of symbols) {
    assert.equal(Object.isFrozen(symbol), true);
    assert.equal(Object.isFrozen(symbol.range), true);
    assert.equal(Object.isFrozen(symbol.range.start), true);
    assert.equal(Object.isFrozen(symbol.range.end), true);
    assert.equal(Object.isFrozen(symbol.selectionRange), true);
    assert.equal(symbol.range.start.line <= symbol.selectionRange.start.line, true);
    assert.equal(symbol.selectionRange.end.character <= symbol.range.end.character, true);
  }
});

test('selects display labels on either side of aliases and supports explicit delimiters', () => {
  const source = [
    'participant Alias as "Display Name"',
    'class "Quoted Name" as Alias',
    'usecase UC as (Check Out)',
    'component ComponentId as [API Edge]',
    'actor :Human User: as Human',
    'database DataStore',
    'collections Records',
    'queue Jobs',
    'annotation Marker',
    'object Singleton',
  ].join('\r\n');
  const symbols = documentSymbolsForSource(source);
  assert.deepEqual(symbols.map(({ name }) => name), [
    'Display Name',
    'Quoted Name',
    'Check Out',
    'API Edge',
    'Human User',
    'DataStore',
    'Records',
    'Jobs',
    'Marker',
    'Singleton',
  ]);
  assert.deepEqual(symbols.map(({ kind }) => kind), [19, 5, 12, 2, 19, 19, 18, 19, 23, 19]);
  assert.deepEqual(symbols.map(({ range }) => range.start.line), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('recognizes documented explicit declaration families conservatively', () => {
  const source = [
    'namespace net.example',
    'rectangle Gateway',
    'node Runtime',
    'cloud Cloud',
    'frame Frame',
    'folder Folder',
    'artifact Binary',
    'file Config',
    'stack Stack',
    'storage Storage',
    'card Card',
    'agent Worker',
    'boundary Boundary',
    'control Controller',
    'entity Entity',
  ].join('\r');
  const symbols = documentSymbolsForSource(source);
  assert.deepEqual(symbols.map(({ detail }) => detail), [
    'namespace', 'rectangle', 'node', 'cloud', 'frame', 'folder', 'artifact',
    'file', 'stack', 'storage', 'card', 'agent', 'boundary', 'control', 'entity',
  ]);
  assert.deepEqual(symbols.map(({ kind }) => kind), [
    3, 19, 19, 19, 19, 19, 1, 1, 19, 19, 19, 19, 19, 19, 19,
  ]);
});

test('ignores comments, implicit relations, directives, and incomplete declarations', () => {
  const source = [
    "' class HiddenLine",
    "/'",
    'participant HiddenBlock',
    "'/",
    'Alice -> Bob : class NotADeclaration',
    '@startuml',
    'skinparam classAttributeIconSize 0',
    'class',
    'class "Customer\'s Account" as Account',
    'class "literal /\' content" as Literal',
    'class Visible \' trailing comment class HiddenTail',
    '@enduml',
  ].join('\n');
  const symbols = documentSymbolsForSource(source);
  assert.deepEqual(symbols.map(({ name }) => name), [
    "Customer's Account",
    "literal /' content",
    'Visible',
  ]);
});

test('keeps exact UTF-16 selection positions and complete declaration-line ranges', () => {
  const source = '  participant "😀 Alpha" as Alpha #red';
  const [symbol] = documentSymbolsForSource(source);
  assert.deepEqual(symbol.selectionRange, {
    start: { line: 0, character: 15 },
    end: { line: 0, character: 23 },
  });
  assert.deepEqual(symbol.range, {
    start: { line: 0, character: 2 },
    end: { line: 0, character: source.length },
  });
});

test('fails closed for invalid source, excessive symbols, and oversized names', () => {
  assert.throws(
    () => documentSymbolsForSource(null),
    (error) => assertError(error, 'document_text_invalid'),
  );
  const excessive = Array.from(
    { length: languageServerLimits.maxDocumentSymbols + 1 },
    (_, index) => `class Class${index}`,
  ).join('\n');
  assert.throws(
    () => documentSymbolsForSource(excessive),
    (error) => assertError(error, 'document_symbols_too_many'),
  );
  const oversized = `class "${'x'.repeat(languageServerLimits.maxSymbolNameBytes + 1)}"`;
  assert.throws(
    () => documentSymbolsForSource(oversized),
    (error) => assertError(error, 'document_symbol_name_too_large'),
  );
});

test('skips malformed quoted and delimited labels instead of inventing symbols', () => {
  const source = [
    'class "Unclosed',
    'usecase (Unclosed',
    'component [Unclosed',
    'actor :Unclosed',
    'class Valid',
  ].join('\n');
  assert.deepEqual(documentSymbolsForSource(source).map(({ name }) => name), ['Valid']);
});
