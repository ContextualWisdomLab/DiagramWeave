# Legacy Document-Symbol Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return the existing hierarchical `DocumentSymbol[]` tree to capable LSP clients and a deeply frozen source-order `SymbolInformation[]` compatibility view to all other clients.

**Architecture:** Add one pure iterative tree-to-flat adapter and keep the PlantUML scanner unchanged. Capture `hierarchicalDocumentSymbolSupport` during initialize in the existing document-symbol session, then choose the presentation shape at request time while preserving source ownership, lifecycle, and concurrency behavior.

**Tech Stack:** Node.js 22/24 ESM, built-in `node:test`, LSP 3.18 JSON structures, zero runtime dependencies, GitHub Actions.

## Global Constraints

- Production source, branch, and function coverage must remain exactly 100%.
- Every production export must have complete JSDoc.
- No skipped, ignored, todo, or expected-failure test is accepted.
- The feature performs no LLM, renderer, filesystem, include, macro, workspace, shell, or network work.
- All returned arrays, records, locations, ranges, and positions are deeply immutable.
- Existing 1 MiB document, 1,024 symbol, and 1,024-byte symbol-name limits remain unchanged.
- Packages remain version `0.0.0` under `CHANGELOG.md` `Unreleased`.
- No database object is introduced.

---

### Task 1: Pure flat compatibility adapter

**Files:**
- Create: `packages/language-server/test/symbol-information.test.js`
- Create: `packages/language-server/src/symbol-information.js`

**Interfaces:**
- Consumes: `readonly Readonly<object>[]` returned by `documentSymbolsForSource(source)` and a validated local URI string.
- Produces: `symbolInformationForDocument(uri, symbols)` returning deeply frozen `readonly Readonly<object>[]`.

- [ ] **Step 1: Write the failing root and nested-tree test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { symbolInformationForDocument } from '../src/symbol-information.js';
import { documentSymbolsForSource } from '../src/symbols.js';

const uri = 'file:///workspace/model.puml';

test('flattens hierarchical document symbols into immutable source-order information', () => {
  const tree = documentSymbolsForSource([
    'package Platform {',
    '  namespace api {',
    '    class Gateway',
    '  }',
    '  class Worker',
    '}',
    'class External',
  ].join('\n'));

  const items = symbolInformationForDocument(uri, tree);
  assert.deepEqual(items.map(({ name }) => name), [
    'Platform',
    'api',
    'Gateway',
    'Worker',
    'External',
  ]);
  assert.equal(items[0].containerName, undefined);
  assert.equal(items[1].containerName, 'Platform');
  assert.equal(items[2].containerName, 'api');
  assert.equal(items[3].containerName, 'Platform');
  assert.equal(items[4].containerName, undefined);
  assert.equal(items[2].location.uri, uri);
  assert.deepEqual(items[2].location.range, tree[0].children[0].children[0].range);
  assert.equal(Object.isFrozen(items), true);
  for (const item of items) {
    assert.equal(Object.isFrozen(item), true);
    assert.equal(Object.isFrozen(item.location), true);
    assert.equal(Object.isFrozen(item.location.range), true);
    assert.equal(Object.isFrozen(item.location.range.start), true);
    assert.equal(Object.isFrozen(item.location.range.end), true);
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test packages/language-server/test/symbol-information.test.js
```

Expected: FAIL because `../src/symbol-information.js` does not exist.

- [ ] **Step 3: Add the minimal iterative adapter**

```js
/**
 * Convert a trusted document-symbol tree into legacy-compatible symbol information.
 *
 * @param {string} uri - Validated local document URI.
 * @param {readonly Readonly<object>[]} symbols - Trusted frozen root symbols.
 * @returns {readonly Readonly<object>[]} Deeply frozen source-order symbol information.
 */
export function symbolInformationForDocument(uri, symbols) {
  const result = [];
  const stack = [];
  for (let index = symbols.length - 1; index >= 0; index -= 1) {
    stack.push({ symbol: symbols[index], containerName: null });
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
      stack.push({ symbol: children[index], containerName: symbol.name });
    }
  }
  return Object.freeze(result);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
node --test packages/language-server/test/symbol-information.test.js
```

Expected: PASS.

- [ ] **Step 5: Add a 512-level non-recursive regression**

Construct 512 nested packages plus one leaf with `documentSymbolsForSource`, flatten the tree, and assert 513 items, source order, and the last item's immediate container.

- [ ] **Step 6: Run the focused test file**

Run:

```bash
node --test packages/language-server/test/symbol-information.test.js
```

Expected: all tests PASS with no warning.

- [ ] **Step 7: Commit the adapter**

```bash
git add packages/language-server/src/symbol-information.js packages/language-server/test/symbol-information.test.js
git commit -m "feat(language-server): add legacy symbol-information adapter"
```

### Task 2: Initialize-time capability negotiation

**Files:**
- Modify: `packages/language-server/src/symbol-session.js`
- Modify: `packages/language-server/test/symbol-session.test.js`

**Interfaces:**
- Consumes: `params.capabilities.textDocument.documentSymbol.hierarchicalDocumentSymbolSupport`.
- Produces: the existing `DocumentSymbol[]` for exact boolean `true`; otherwise `symbolInformationForDocument(uri, tree)`.

- [ ] **Step 1: Update the test initializer to request hierarchy explicitly**

```js
async function initialize(session, hierarchicalDocumentSymbolSupport = true) {
  const result = await session.request('initialize', {
    capabilities: {
      textDocument: {
        documentSymbol: { hierarchicalDocumentSymbolSupport },
      },
    },
  });
  await session.notify('initialized', {});
  return result;
}
```

Keep existing hierarchical assertions on this explicit path.

- [ ] **Step 2: Add failing absent and false capability tests**

Open a nested package source and assert the response is a flat array containing `location.uri`, `location.range`, and immediate `containerName`, with no `children`, `detail`, or `selectionRange` properties.

- [ ] **Step 3: Add failing hostile capability tests**

Use getters that throw at `capabilities`, `textDocument`, `documentSymbol`, and `hierarchicalDocumentSymbolSupport`. Initialization must not leak the thrown value and subsequent document symbols must use the flat response.

- [ ] **Step 4: Run the direct session tests and verify RED**

Run:

```bash
node --test packages/language-server/test/symbol-session.test.js
```

Expected: legacy-shape tests FAIL because the session always returns the hierarchy.

- [ ] **Step 5: Implement the capability probe and response selection**

Add:

```js
import { symbolInformationForDocument } from './symbol-information.js';

function clientSupportsHierarchicalDocumentSymbols(params) {
  try {
    return isPlainRecord(params) &&
      isPlainRecord(params.capabilities) &&
      isPlainRecord(params.capabilities.textDocument) &&
      isPlainRecord(params.capabilities.textDocument.documentSymbol) &&
      params.capabilities.textDocument.documentSymbol
        .hierarchicalDocumentSymbolSupport === true;
  } catch {
    return false;
  }
}
```

Capture the boolean before delegating initialize. In `textDocument/documentSymbol`, build the authoritative tree once and return it directly only when support is true; otherwise return `symbolInformationForDocument(normalized.textDocument.uri, tree)`.

- [ ] **Step 6: Run the direct session tests and verify GREEN**

Run:

```bash
node --test packages/language-server/test/symbol-session.test.js packages/language-server/test/symbol-information.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit capability negotiation**

```bash
git add packages/language-server/src/symbol-session.js packages/language-server/test/symbol-session.test.js
git commit -m "feat(language-server): negotiate document-symbol hierarchy"
```

### Task 3: Public composition and real stdio evidence

**Files:**
- Modify: `packages/language-server/test/completion-session.test.js`
- Modify: `packages/language-server-stdio/test/document-symbol.test.js`

**Interfaces:**
- Consumes: the unchanged public `createLanguageServerSession` and bounded stdio connection.
- Produces: identical negotiated document-symbol shapes through embedded and process transports.

- [ ] **Step 1: Make hierarchy-dependent completion-session fixtures explicit**

Add `documentSymbol: { hierarchicalDocumentSymbolSupport: true }` beside completion capability in every fixture that asserts `children`.

- [ ] **Step 2: Update the existing stdio hierarchy request**

Initialize with:

```js
params: {
  capabilities: {
    textDocument: {
      documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    },
  },
}
```

Retain the existing nested result assertion.

- [ ] **Step 3: Add a failing legacy stdio round-trip**

Initialize with empty capabilities, open the same source, request document symbols, and assert two flat `SymbolInformation` records in source order. `Core` has no `containerName`; `API` has `containerName: 'Core'`; both locations use the open URI.

- [ ] **Step 4: Run transport tests**

Run:

```bash
node --test packages/language-server/test/completion-session.test.js packages/language-server-stdio/test/document-symbol.test.js
```

Expected: all tests PASS after Task 2 implementation.

- [ ] **Step 5: Commit transport evidence**

```bash
git add packages/language-server/test/completion-session.test.js packages/language-server-stdio/test/document-symbol.test.js
git commit -m "test(stdio): cover legacy document-symbol clients"
```

### Task 4: Product, standards, package, and repository contracts

**Files:**
- Create: `docs/research/lsp-document-symbol-compatibility.md`
- Create: `docs/operations/document-symbol-compatibility.md`
- Create: `docs/product/document-symbol-compatibility.md`
- Create: `tests/document-symbol-compatibility-repository-contract.test.js`
- Modify: `packages/language-server/README.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/architecture.md`
- Modify: `docs/product/diagramweave-prd.md`
- Modify: `CHANGELOG.md`
- Modify: `scripts/check-package-contents.mjs`

**Interfaces:**
- Consumes: the implemented negotiated response contract.
- Produces: durable APA 7th, product, operations, architecture, and package evidence.

- [ ] **Step 1: Write the failing repository contract test**

Require all three new documents, `src/symbol-information.js`, the capability name, `SymbolInformation[]`, iterative traversal, URI privacy boundary, LSP 3.18 APA reference, PRD implementation status, `Unreleased` changelog entry, and exact package allowlist entry.

- [ ] **Step 2: Run the repository contract test and verify RED**

Run:

```bash
node --test tests/document-symbol-compatibility-repository-contract.test.js
```

Expected: FAIL because the durable records and package allowlist are incomplete.

- [ ] **Step 3: Write research, operations, and product records**

Research records LSP 3.18 capability and result unions with APA 7th references. Operations documents client negotiation, response inspection, recovery, and no-URI-dereference behavior. Product documents modern and legacy user outcomes and the no-Figma boundary.

- [ ] **Step 4: Update public and architecture documents**

State that clients explicitly advertising hierarchy receive `DocumentSymbol[]`; all others receive flat `SymbolInformation[]` from the same scanner. Remove the feature from residual-gap lists.

- [ ] **Step 5: Update the package allowlist**

Add exactly:

```text
package/src/symbol-information.js
```

to the language-server package contract.

- [ ] **Step 6: Run repository contracts**

Run:

```bash
node --test tests/document-symbol-compatibility-repository-contract.test.js tests/document-symbol-repository-contract.test.js tests/hierarchical-symbols-repository-contract.test.js tests/declaration-completion-repository-contract.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit durable contracts**

```bash
git add README.md ARCHITECTURE.md CHANGELOG.md docs packages/language-server/README.md scripts/check-package-contents.mjs tests/document-symbol-compatibility-repository-contract.test.js
git commit -m "docs: publish document-symbol compatibility contract"
```

### Task 5: Exact package and repository verification

**Files:**
- Review all changed files.
- Update the pull-request description only after exact-head evidence exists.

**Interfaces:**
- Consumes: the complete implementation tree.
- Produces: one immutable merge candidate.

- [ ] **Step 1: Run syntax and focused tests**

```bash
npm run syntax
node --test packages/language-server/test/symbol-information.test.js packages/language-server/test/symbol-session.test.js packages/language-server-stdio/test/document-symbol.test.js tests/document-symbol-compatibility-repository-contract.test.js
```

Expected: exit 0.

- [ ] **Step 2: Run the complete repository verification**

```bash
npm run verify
```

Expected: zero failures, zero skipped/todo tests, production line/branch/function coverage 100%, production JSDoc coverage 100%.

- [ ] **Step 3: Verify exact package contents**

```bash
node scripts/check-package-contents.mjs
```

Expected: both workspace contracts PASS and no unexpected package files.

- [ ] **Step 4: Inspect the final diff**

```bash
git diff --check main...HEAD
git status --short
```

Expected: no whitespace errors and a clean tree.

- [ ] **Step 5: Open or update the draft pull request**

Reference issue `#12`, enumerate the negotiated shapes, standards, exact test count, coverage, package evidence, and release boundary. Keep the PR draft until all exact-head gates pass.

- [ ] **Step 6: Verify hosted gates on the exact head**

Require Node.js 22 and 24 CI, SAST Semgrep, Security Scan, CodeRabbit, and zero unresolved review threads. Re-run or repair failures without treating queued work as success.

- [ ] **Step 7: Mark ready and merge with head protection**

Mark the PR ready only after exact-head evidence is complete. Squash merge using `expected_head_sha`; then confirm the issue is closed and the open PR queue is zero before selecting the next buyer-visible gap.
