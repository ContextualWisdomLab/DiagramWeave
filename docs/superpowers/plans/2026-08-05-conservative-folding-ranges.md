# Conservative Folding Ranges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add capability-gated LSP 3.18 `textDocument/foldingRange` results for only the package and namespace scopes already proven by DiagramWeave's conservative document-symbol scanner.

**Architecture:** Keep `documentSymbolsForSource` as the sole structural parser. Add a pure iterative folding adapter, then compose a new outer folding session over the existing completion session so diagnostics, symbols, completion, stdio, naruon, and embedded hosts share the same accepted snapshots and protocol contract.

**Tech Stack:** Node.js 22/24 ESM, built-in `node:test`, LSP 3.18 JSON structures, zero runtime dependencies, GitHub Actions.

## Global Constraints

- Production line, branch, and function coverage must remain exactly 100%.
- Every production module and exported function must have complete JSDoc.
- No skipped, ignored, todo, or expected-failure test is accepted.
- Folding performs no LLM, renderer, file, URI-dereference, include, macro, workspace, shell, or network work.
- All returned arrays and records are deeply immutable.
- Existing 1 MiB source, 1,024 symbol, 1,024-byte name, 256 open-document, and 4,096-byte URI limits remain unchanged.
- Packages remain version `0.0.0` under `CHANGELOG.md` `Unreleased`.
- No database object is introduced.

---

### Task 1: Pure conservative folding engine

**Files:**
- Create: `packages/language-server/test/folding-ranges.test.js`
- Create: `packages/language-server/src/folding-ranges.js`

**Interfaces:**
- Consumes: complete PlantUML source and a validated nonnegative range limit.
- Produces: `foldingRangesForSource(source, rangeLimit)` returning a deeply frozen source-order `FoldingRange[]`.

- [ ] **Step 1: Write the failing nested and sibling test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { foldingRangesForSource } from '../src/folding-ranges.js';

test('returns immutable source-order folds for proven package and namespace scopes', () => {
  const source = [
    'package Platform {',
    '  namespace api {',
    '    class Gateway',
    '  }',
    '  class Worker',
    '}',
    'package External {',
    '  class Port',
    '}',
  ].join('\n');

  const ranges = foldingRangesForSource(source, 1024);
  assert.deepEqual(ranges, [
    { startLine: 0, endLine: 5 },
    { startLine: 1, endLine: 3 },
    { startLine: 6, endLine: 8 },
  ]);
  assert.equal(Object.isFrozen(ranges), true);
  for (const range of ranges) {
    assert.equal(Object.isFrozen(range), true);
    assert.equal('startCharacter' in range, false);
    assert.equal('endCharacter' in range, false);
    assert.equal('kind' in range, false);
    assert.equal('collapsedText' in range, false);
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test packages/language-server/test/folding-ranges.test.js
```

Expected: FAIL because `../src/folding-ranges.js` does not exist.

- [ ] **Step 3: Add the minimal iterative engine**

```js
import { languageServerLimits } from './limits.js';
import { documentSymbolsForSource } from './symbols.js';

const emptyFoldingRanges = Object.freeze([]);

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
  while (stack.length > 0 && result.length < rangeLimit) {
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
```

Add JSDoc describing trust, source order, range omission, and limits.

- [ ] **Step 4: Run the focused test and verify GREEN**

```bash
node --test packages/language-server/test/folding-ranges.test.js
```

Expected: PASS.

- [ ] **Step 5: Add edge-case tests**

Cover:

- empty two-line scopes and balanced one-line scopes produce no range;
- unmatched, cross-indented, quoted, commented, multi-open, and non-grouping
  declaration braces produce no range;
- LF, CRLF, and CR produce identical line numbers;
- Korean labels and emoji do not shift line ranges;
- range limit `0`, `1`, and larger than the symbol ceiling;
- no proven scopes returns the shared frozen empty collection;
- invalid and oversized source errors remain the scanner's stable errors.

- [ ] **Step 6: Add a 512-level iterative regression**

Generate 512 nested package scopes and one leaf. Assert exactly 512 ranges at
the full limit and a source-prefix result at a small limit without call-stack
failure.

- [ ] **Step 7: Run focused engine tests**

```bash
node --test packages/language-server/test/folding-ranges.test.js
```

Expected: all tests PASS.

- [ ] **Step 8: Commit the engine**

```bash
git add packages/language-server/src/folding-ranges.js packages/language-server/test/folding-ranges.test.js
git commit -m "feat(language-server): add conservative folding engine"
```

### Task 2: Capability and option normalization

**Files:**
- Create: `packages/language-server/test/folding-session.test.js`
- Create: `packages/language-server/src/folding-session.js`

**Interfaces:**
- Consumes: `params.capabilities.textDocument.foldingRange`.
- Produces: immutable negotiated options or unsupported state.

- [ ] **Step 1: Write failing capability tests**

Assert that a plain `{}` folding capability advertises
`foldingRangeProvider: true`, while absent, array-valued, malformed, revoked, or
throwing paths do not advertise it.

- [ ] **Step 2: Write failing range-option tests**

Cover absent `rangeLimit`, limits `0`, `1`, `1024`, and `2147483647`, boolean
`lineFoldingOnly`, and rejection of negative, fractional, unsafe, string, and
throwing option values.

- [ ] **Step 3: Run the new session tests and verify RED**

```bash
node --test packages/language-server/test/folding-session.test.js
```

Expected: FAIL because `folding-session.js` does not exist.

- [ ] **Step 4: Implement guarded client option normalization**

Create an internal helper that returns `null` unless the capability path is made
of plain records and optional fields satisfy the design contract. Cap range
output at `languageServerLimits.maxDocumentSymbols` even if the client prefers a
larger number.

- [ ] **Step 5: Advertise the provider only when negotiated**

Wrap the delegated initialize result with a new frozen capabilities record that
adds `foldingRangeProvider: true` only for valid supported options.

- [ ] **Step 6: Run capability tests and verify GREEN**

```bash
node --test packages/language-server/test/folding-session.test.js
```

Expected: capability tests PASS; request tests remain RED until Task 3.

- [ ] **Step 7: Commit option negotiation**

```bash
git add packages/language-server/src/folding-session.js packages/language-server/test/folding-session.test.js
git commit -m "feat(language-server): negotiate folding-range support"
```

### Task 3: Snapshot lifecycle and folding requests

**Files:**
- Modify: `packages/language-server/src/folding-session.js`
- Modify: `packages/language-server/test/folding-session.test.js`

**Interfaces:**
- Consumes: accepted open and full-document change snapshots.
- Produces: `textDocument/foldingRange` results from the latest accepted source.

- [ ] **Step 1: Write failing request tests**

Cover supported request, unsupported method error, malformed params, remote URI,
unopened document, and immutable results.

- [ ] **Step 2: Write failing lifecycle tests**

Cover before initialized, after shutdown, after exit, after dispose, close,
rejected open/change, newer change superseding older completion, rejected newer
mutation not suppressing older valid work, and close during validation.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
node --test packages/language-server/test/folding-session.test.js
```

Expected: request and lifecycle tests FAIL until source ownership is implemented.

- [ ] **Step 4: Implement request normalization and ready checks**

Normalize only a bounded local text-document URI. Preserve the existing stable
`invalid_request`, `document_not_open`, `server_not_initialized`,
`server_not_ready`, `server_shutting_down`, and `method_not_found` families.

- [ ] **Step 5: Mirror accepted source snapshots**

Use the existing epoch, mutation sequence, active set, last-applied sequence,
and invalidation pattern. Delegate normalized notifications to the completion
session before applying the outer snapshot.

- [ ] **Step 6: Serve folding from the latest accepted source**

Call `foldingRangesForSource(record.text, negotiatedRangeLimit)`. Do not call the
renderer or dereference the URI.

- [ ] **Step 7: Run direct session tests and verify GREEN**

```bash
node --test packages/language-server/test/folding-session.test.js packages/language-server/test/folding-ranges.test.js
```

Expected: all tests PASS.

- [ ] **Step 8: Commit session behavior**

```bash
git add packages/language-server/src/folding-session.js packages/language-server/test/folding-session.test.js
git commit -m "feat(language-server): serve latest folding ranges"
```

### Task 4: Public composition and bounded stdio evidence

**Files:**
- Modify: `packages/language-server/src/index.js`
- Modify: `packages/language-server/test/package.test.js`
- Create: `packages/language-server-stdio/test/folding-range.test.js`

**Interfaces:**
- Consumes: existing public `createLanguageServerSession` and stdio connection.
- Produces: the new folding outer layer through embedded and process transports.

- [ ] **Step 1: Write the failing public composition assertion**

Require `createFoldingLanguageServerSession as createLanguageServerSession` in
the public index.

- [ ] **Step 2: Write failing real stdio tests**

One client initializes with `textDocument.foldingRange: {}` and receives
provider capability plus nested source-order ranges. Another client omits the
capability, does not receive the provider, and receives fixed JSON-RPC method-not-found
for a folding request. Verify diagnostic notifications and graceful shutdown do
not change.

- [ ] **Step 3: Run focused transport tests and verify RED**

```bash
node --test packages/language-server/test/package.test.js packages/language-server-stdio/test/folding-range.test.js
```

Expected: public composition and folding request tests FAIL.

- [ ] **Step 4: Change the public alias**

```js
export {
  createFoldingLanguageServerSession as createLanguageServerSession,
} from './folding-session.js';
```

- [ ] **Step 5: Run direct and stdio tests**

```bash
node --test packages/language-server/test/folding-session.test.js packages/language-server/test/package.test.js packages/language-server-stdio/test/folding-range.test.js
```

Expected: all tests PASS.

- [ ] **Step 6: Commit public transport composition**

```bash
git add packages/language-server/src/index.js packages/language-server/test/package.test.js packages/language-server-stdio/test/folding-range.test.js
git commit -m "feat(language-server): expose folding ranges through stdio"
```

### Task 5: Standards, product, operations, and repository contracts

**Files:**
- Create: `docs/research/plantuml-folding-ranges.md`
- Create: `docs/operations/folding-ranges.md`
- Create: `docs/product/folding-ranges.md`
- Create: `tests/folding-ranges-repository-contract.test.js`
- Modify: `README.md`
- Modify: `packages/language-server/README.md`
- Modify: `packages/language-server-stdio/README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/architecture.md`
- Modify: `docs/product/diagramweave-prd.md`
- Modify: `CHANGELOG.md`
- Modify: `scripts/check-package-contents.mjs`

**Interfaces:**
- Consumes: implemented folding contract.
- Produces: durable APA 7th, product, operations, architecture, PRD, package, and release-boundary evidence.

- [ ] **Step 1: Write the failing repository contract test**

Require the new source and test modules, all three records, LSP 3.18 folding
capability and line semantics, PlantUML package/namespace basis, no renderer or
LLM, iterative traversal, range-limit contract, modular Studio/IDE/naruon/CWL
reuse, no-Figma boundary, PRD implementation status, changelog entry, public
composition, and package allowlist entries.

- [ ] **Step 2: Run the repository contract and verify RED**

```bash
node --test tests/folding-ranges-repository-contract.test.js
```

Expected: FAIL because records and public documents are incomplete.

- [ ] **Step 3: Write research, operations, and product records**

Research cites the official LSP 3.18 folding specification and official
PlantUML class-diagram package syntax in APA 7th. Operations documents client
negotiation, line behavior, limits, recovery, and privacy. Product documents the
large-file navigation outcome, accessibility, and no-Figma boundary.

- [ ] **Step 4: Update architecture, PRD, and changelog**

Add the folding outer layer to diagrams and data flow, mark the bounded PRD
foundation implemented, record exact non-responsibilities, and keep version
`0.0.0` under `Unreleased`.

- [ ] **Step 5: Update exact package contents**

Add:

```text
package/src/folding-ranges.js
package/src/folding-session.js
```

to the language-server allowlist.

- [ ] **Step 6: Run repository contract suites**

```bash
node --test tests/folding-ranges-repository-contract.test.js tests/document-symbol-compatibility-repository-contract.test.js tests/hierarchical-symbols-repository-contract.test.js tests/declaration-completion-repository-contract.test.js tests/language-server-repository-contract.test.js tests/language-server-stdio-repository-contract.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit durable records**

```bash
git add README.md ARCHITECTURE.md CHANGELOG.md docs packages/language-server/README.md packages/language-server-stdio/README.md scripts/check-package-contents.mjs tests/folding-ranges-repository-contract.test.js
git commit -m "docs: publish conservative folding-range contract"
```

### Task 6: Exact package and repository verification

**Files:**
- Review all changed files.
- Update the pull-request description only after exact-head evidence exists.

**Interfaces:**
- Consumes: complete implementation tree.
- Produces: one immutable merge candidate.

- [ ] **Step 1: Run syntax and focused tests**

```bash
npm run syntax
node --test packages/language-server/test/folding-ranges.test.js packages/language-server/test/folding-session.test.js packages/language-server-stdio/test/folding-range.test.js tests/folding-ranges-repository-contract.test.js
```

Expected: exit 0.

- [ ] **Step 2: Run complete repository verification**

```bash
npm run verify
```

Expected: zero failures, zero skipped/todo tests, production line/branch/function
coverage 100%, and production JSDoc coverage 100%.

- [ ] **Step 3: Verify exact package contents**

```bash
node scripts/check-package-contents.mjs
```

Expected: both workspace contracts PASS with no unexpected files.

- [ ] **Step 4: Inspect the final diff**

```bash
git diff --check main...HEAD
git status --short
```

Expected: no whitespace errors and a clean tree.

- [ ] **Step 5: Open or update the draft pull request**

Reference issue `#14`. Record the capability, exact line contract, range-limit
policy, TDD red evidence, test count, coverage, package evidence, security
boundary, and release status. Keep the PR draft until exact-head verification is
complete.

- [ ] **Step 6: Verify hosted gates on one exact head**

Require Node.js 22 and 24 CI, SAST Semgrep, Security Scan, CodeRabbit, and zero
unresolved review threads. Queued work is not success; repair any failure and
re-run the complete gates.

- [ ] **Step 7: Mark ready and merge with head protection**

Mark the PR ready only after exact-head evidence is complete. Squash merge using
`expected_head_sha`; then confirm issue #14 is closed and the open PR queue is
zero before selecting the next buyer-visible gap.
