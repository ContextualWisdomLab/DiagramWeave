# Conservative Same-Document PlantUML References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add capability-gated LSP 3.18 `textDocument/references` that returns bounded, immutable, source-order same-document references for one uniquely proven explicit PlantUML identifier.

**Architecture:** Extend the existing declaration-derived navigation engine in `definitions.js` so definitions and references share one identifier grammar, one ambiguity policy, and one structural masking implementation. Compose a new reference session over the definition session, mirror only accepted source snapshots, and expose the feature identically through embedded and stdio hosts.

**Tech Stack:** Node.js 22–24, ECMAScript modules, built-in `node:test`, built-in test coverage, LSP 3.18 JSON-RPC contracts, existing DiagramWeave PlantUML symbol tree.

## Global Constraints

- Declaration existence and declaration ranges come only from `documentSymbolsForSource`.
- No LLM, renderer, file, include, macro, workspace, shell, or network work is allowed.
- `textDocument.references` must be a valid plain client capability before `referencesProvider: true` is advertised.
- `ReferenceContext.includeDeclaration` must be a boolean.
- Results are deeply frozen, deduplicated, sorted by source position, and limited to 4,096 locations.
- A valid position without a unique supported identity returns one shared frozen empty array.
- Overflow raises source-free `reference_limit_exceeded`; it must never truncate silently.
- Production line, branch, and function coverage and public JSDoc coverage must be exactly 100%.
- No skipped, todo, ignored, or expected-failure test is accepted.
- Packages remain `0.0.0` under `Unreleased`; this plan does not publish a release.

---

## File Structure

- Modify `packages/language-server/src/definitions.js` — shared pure definition and reference evidence engine.
- Create `packages/language-server/src/reference-session.js` — capability and accepted-snapshot adapter.
- Modify `packages/language-server/src/index.js` — public composition and exports.
- Create `packages/language-server/test/references.test.js` — core reference results.
- Create `packages/language-server/test/references-boundaries.test.js` — bounds, UTF-16, freezing, limits, hostile inputs.
- Create `packages/language-server/test/references-contexts.test.js` — comments, labels, directives, alias ambiguity.
- Create `packages/language-server/test/reference-session.test.js` — capability, lifecycle, snapshots, concurrency.
- Create `packages/language-server-stdio/test/references.test.js` — framed process transport parity.
- Modify `scripts/check-package-contents.mjs` — packed engine/session evidence.
- Modify package and repository contract tests — durable documentation and composition gates.
- Create `docs/research/plantuml-same-document-references.md` — standards and APA 7th traceability.
- Create `docs/operations/same-document-references.md` — activation, limits, privacy, diagnostics.
- Create `docs/product/same-document-references.md` — buyer journey and deferred UI boundary.
- Modify `README.md`, package READMEs, PRD, architecture records, `CHANGELOG.md`, and package metadata.

---

### Task 1: Commit deliberate pure-engine RED evidence

**Files:**
- Create: `packages/language-server/test/references.test.js`
- Create: `packages/language-server/test/references-boundaries.test.js`
- Create: `packages/language-server/test/references-contexts.test.js`

**Interfaces:**
- Consumes: existing `definitionForSource(source, uri, position)` behavior and authoritative symbols.
- Produces: expected public signature `referencesForSource(source, uri, position, includeDeclaration)`.

- [ ] **Step 1: Write the first failing result test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { referencesForSource } from '../src/definitions.js';

const source = [
  '@startuml',
  'class "Order Service" as OrderService',
  'actor Customer',
  'Customer --> OrderService : submits',
  'OrderService : submit()',
  '@enduml',
  '',
].join('\n');

const uri = 'file:///workspace/model.puml';

test('returns immutable source-order references with optional declaration', () => {
  const references = referencesForSource(source, uri, { line: 3, character: 15 }, true);
  assert.deepEqual(references, [
    { uri, range: { start: { line: 1, character: 7 }, end: { line: 1, character: 20 } } },
    { uri, range: { start: { line: 3, character: 13 }, end: { line: 3, character: 25 } } },
    { uri, range: { start: { line: 4, character: 0 }, end: { line: 4, character: 12 } } },
  ]);
  assert.equal(Object.isFrozen(references), true);
  assert.equal(Object.isFrozen(references[0]), true);
});
```

- [ ] **Step 2: Add failing exclusion and ambiguity tests**

Cover `includeDeclaration: false`, duplicate identifiers, no-match positions, comment/string/directive/label suppression, both alias orientations, LF/CRLF/CR, Unicode identifiers, and declaration alias cursor behavior.

- [ ] **Step 3: Add failing boundary tests**

Generate exactly 4,095 structural occurrences plus one declaration and assert success at 4,096. Generate one more occurrence and assert `reference_limit_exceeded`. Add revoked Proxy position, oversized source, remote URI, non-boolean include flag, and immutable nested range assertions.

- [ ] **Step 4: Run focused tests and observe RED**

Run:

```bash
node --test \
  packages/language-server/test/references.test.js \
  packages/language-server/test/references-boundaries.test.js \
  packages/language-server/test/references-contexts.test.js
```

Expected: module import failure because `referencesForSource` is not exported.

- [ ] **Step 5: Commit RED evidence**

```bash
git add packages/language-server/test/references*.test.js
git commit -m "test: specify conservative same-document references"
```

---

### Task 2: Implement shared pure reference evidence

**Files:**
- Modify: `packages/language-server/src/definitions.js`
- Test: `packages/language-server/test/references*.test.js`

**Interfaces:**
- Consumes: `documentSymbolsForSource`, `identifierForSymbol`, `flattenSymbols`, `maskUntrustedText`, `structuralSegmentForLine`, `normalizeDocumentUri`, and existing limits.
- Produces: `referencesForSource(source, uri, position, includeDeclaration): readonly Location[]`.

- [ ] **Step 1: Add immutable output primitives**

Add:

```js
const maximumReferenceLocations = 4_096;
const emptyReferenceLocations = Object.freeze([]);
```

Add a `referenceLimitError()` helper that returns:

```js
new LanguageServerError(
  'reference_limit_exceeded',
  'The document contains too many reference locations.',
  { method: 'textDocument/references' },
)
```

- [ ] **Step 2: Extract shared cursor identity resolution**

Introduce one private `navigationEvidenceForSource(source, uri, position)` helper that:

1. builds the authoritative symbol tree once;
2. validates URI and position;
3. derives conservative identifier records;
4. marks duplicates as ambiguous;
5. identifies a direct declaration, declaration alias, or structural token at the cursor;
6. returns frozen evidence containing the validated URI, lines, flattened symbols, identifier records, unique target map, selected identifier, selected target, and direct definition target.

Preserve current `definitionForSource` behavior for declaration self-navigation, including declarations that do not contribute a supported reference identifier.

- [ ] **Step 3: Add one-pass structural line masking**

Add `maskedLinesForSource(lines)` that carries block-comment state forward once and returns same-length masked lines. Reference collection must not call `maskedTargetLine` for every line because that would produce quadratic rescanning.

- [ ] **Step 4: Implement `referencesForSource`**

The function must:

1. reject non-boolean `includeDeclaration` with source-free `invalid_request`;
2. resolve shared navigation evidence;
3. return `emptyReferenceLocations` for unsupported or ambiguous identity;
4. skip every authoritative declaration line during occurrence scanning;
5. scan only structural segments and exact identifier tokens;
6. add the declaration `selectionRange` only when requested;
7. deduplicate by `line:start:end` key;
8. enforce the 4,096-location ceiling before adding another item;
9. sort by start line, start character, end line, end character;
10. deeply freeze every `Location`, `Range`, and returned array.

- [ ] **Step 5: Run focused tests**

Run the Task 1 command. Expected: all focused pure-engine tests pass.

- [ ] **Step 6: Run definition regression tests**

```bash
node --test packages/language-server/test/definitions*.test.js
```

Expected: all existing definition tests pass unchanged.

- [ ] **Step 7: Commit pure engine**

```bash
git add packages/language-server/src/definitions.js packages/language-server/test/references*.test.js
git commit -m "feat: add bounded same-document reference evidence"
```

---

### Task 3: Commit reference-session RED evidence

**Files:**
- Create: `packages/language-server/test/reference-session.test.js`

**Interfaces:**
- Consumes: expected `createReferenceLanguageServerSession(options)`.
- Produces: negotiated `textDocument/references` session behavior.

- [ ] **Step 1: Write failing capability tests**

Assert that a plain `capabilities.textDocument.references` record adds `referencesProvider: true`, while missing, array, primitive, revoked Proxy, and throwing records do not advertise or serve the request.

- [ ] **Step 2: Write failing request validation tests**

Cover malformed top-level params, text document, position, context, non-boolean `includeDeclaration`, remote URI, unopened document, and lifecycle error codes.

- [ ] **Step 3: Write failing snapshot and race tests**

Mirror definition-session tests for accepted open/change/close, rejected mutations preserving the last accepted snapshot, older completion waiting behind newer mutation, newer accepted change superseding older completion, close during validation, shutdown/exit/disposal invalidation, and hostile direct mutation boundaries.

- [ ] **Step 4: Run and observe RED**

```bash
node --test packages/language-server/test/reference-session.test.js
```

Expected: module-not-found for `reference-session.js`.

- [ ] **Step 5: Commit RED evidence**

```bash
git add packages/language-server/test/reference-session.test.js
git commit -m "test: specify negotiated reference sessions"
```

---

### Task 4: Implement the transport-neutral reference session

**Files:**
- Create: `packages/language-server/src/reference-session.js`
- Modify: `packages/language-server/src/index.js`
- Test: `packages/language-server/test/reference-session.test.js`

**Interfaces:**
- Consumes: `createDefinitionLanguageServerSession(options)` and `referencesForSource`.
- Produces: `createReferenceLanguageServerSession(options)` and public `createLanguageServerSession` composition.

- [ ] **Step 1: Implement fail-closed capability negotiation**

Add private `referencesSupportedByClient(params)` and `advertiseReferences(result)` helpers following the definition-session pattern.

- [ ] **Step 2: Normalize request parameters**

Add `normalizeReferenceParams(params)` that owns and freezes:

```js
{
  textDocument: { uri },
  position: { line, character },
  context: { includeDeclaration },
}
```

Preserve trusted `LanguageServerError` values and collapse hostile getters to fixed source-free errors.

- [ ] **Step 3: Mirror accepted source snapshots**

Compose `createDefinitionLanguageServerSession`. Reuse the proven epoch, active mutation set, last-applied sequence, ready-state, shutdown, exit, and disposal pattern without shared global state.

- [ ] **Step 4: Serve `textDocument/references`**

Require a ready lifecycle, negotiated capability, and open document. Delegate to:

```js
referencesForSource(
  record.text,
  normalized.textDocument.uri,
  normalized.position,
  normalized.context.includeDeclaration,
)
```

- [ ] **Step 5: Compose the public entry point**

Update `src/index.js` to export the pure reference function and direct reference session, and alias `createReferenceLanguageServerSession` as `createLanguageServerSession`.

- [ ] **Step 6: Run session and legacy tests**

```bash
node --test packages/language-server/test/reference-session.test.js
node --test packages/language-server/test/*.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit session implementation**

```bash
git add packages/language-server/src/reference-session.js packages/language-server/src/index.js packages/language-server/test/reference-session.test.js
git commit -m "feat: add negotiated PlantUML reference sessions"
```

---

### Task 5: Add real stdio parity

**Files:**
- Create: `packages/language-server-stdio/test/references.test.js`

**Interfaces:**
- Consumes: existing framed connection and public Language Server session.
- Produces: exact JSON-RPC parity for `textDocument/references`.

- [ ] **Step 1: Write a framed success test**

Initialize with references support, send `initialized`, `didOpen`, then request references with declaration included. Assert one JSON-RPC success response with exact source-order locations.

- [ ] **Step 2: Add unsupported and invalid tests**

Assert unnegotiated references maps to `-32601`, malformed context/position maps to `-32602`, and no response includes source or URI values in error data.

- [ ] **Step 3: Run stdio tests**

```bash
node --test packages/language-server-stdio/test/references.test.js
```

Expected: all tests pass.

- [ ] **Step 4: Commit stdio parity**

```bash
git add packages/language-server-stdio/test/references.test.js
git commit -m "test: verify references over bounded stdio"
```

---

### Task 6: Add durable standards, product, operations, and architecture records

**Files:**
- Create: `docs/research/plantuml-same-document-references.md`
- Create: `docs/operations/same-document-references.md`
- Create: `docs/product/same-document-references.md`
- Modify: `README.md`
- Modify: `packages/language-server/README.md`
- Modify: `packages/language-server-stdio/README.md`
- Modify: `docs/product/diagramweave-prd.md`
- Modify: `docs/architecture.md`
- Modify: `ARCHITECTURE.md`
- Modify: `CHANGELOG.md`
- Modify: `packages/language-server/package.json`

**Interfaces:**
- Consumes: completed behavior and exact limits.
- Produces: user, operator, host, and reviewer contracts aligned with code.

- [ ] **Step 1: Write research traceability**

Document LSP 3.18 request/capability/context/result semantics, PlantUML alias rules, the deliberate same-document subset, ambiguity policy, and APA 7th references.

- [ ] **Step 2: Write operations contract**

Document capability activation, local URI non-dereference, 4,096-location limit, error codes, no-skipped-test rule, privacy boundary, and embedded/stdio parity.

- [ ] **Step 3: Write product contract**

Document Find All References user journeys, exact declaration-toggle behavior, Studio/IDE/naruon/CWL reuse, accessibility, deferred Figma requirements, and release boundary.

- [ ] **Step 4: Update architecture, PRD, README, package, and changelog**

State that references compose over definitions and share the same authoritative navigation evidence. Keep the package at `0.0.0` and record the capability under `Unreleased`.

- [ ] **Step 5: Commit durable records**

```bash
git add README.md ARCHITECTURE.md CHANGELOG.md docs packages/language-server/package.json
git commit -m "docs: record same-document reference contracts"
```

---

### Task 7: Add package and repository contract gates

**Files:**
- Modify: `scripts/check-package-contents.mjs`
- Modify: `packages/language-server/test/package-contract.test.js`
- Modify: `tests/document-symbol-repository-contract.test.js`
- Create: `tests/same-document-references-repository-contract.test.js`

**Interfaces:**
- Consumes: completed implementation and documentation.
- Produces: regression gates for shipped files, composition, standards, and package evidence.

- [ ] **Step 1: Require packed reference files**

Assert dry-run package contents include `package/src/reference-session.js` and the source file exporting `referencesForSource`.

- [ ] **Step 2: Assert public composition**

Assert `src/index.js` composes references over definitions and exports `referencesForSource` plus `createReferenceLanguageServerSession`.

- [ ] **Step 3: Assert durable records**

Require `textDocument/references`, `referencesProvider`, `includeDeclaration`, 4,096, same-document scope, no URI dereference, APA 7th references, Figma boundary, PRD FR-012, changelog, and architecture composition.

- [ ] **Step 4: Run contract tests**

```bash
node --test tests/same-document-references-repository-contract.test.js
node scripts/check-package-contents.mjs
```

Expected: both pass.

- [ ] **Step 5: Commit gates**

```bash
git add scripts packages/language-server/test tests
git commit -m "test: gate shipped reference navigation contracts"
```

---

### Task 8: Complete exact verification and PR lifecycle

**Files:**
- Modify only if verification reveals a source defect.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: one reviewable PR with exact-head evidence.

- [ ] **Step 1: Run complete local verification**

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run verify
node scripts/check-package-contents.mjs
```

Expected:

- syntax passes;
- every test passes with zero skipped/todo;
- production lines, branches, and functions are exactly 100%;
- production JSDoc is exactly 100%;
- both workspace package dry runs pass.

- [ ] **Step 2: Remove unreachable production code instead of excluding it**

When coverage reports an unreachable branch, prove whether the branch is valid. Add a realistic regression test when reachable; delete or simplify genuinely unreachable code. Do not weaken thresholds or add ignore directives.

- [ ] **Step 3: Open one draft PR**

Use title:

```text
feat: add conservative same-document PlantUML references
```

Body must link `Closes #21`, summarize scope, TDD RED evidence, limits, privacy, standards, Figma boundary, and unreleased status.

- [ ] **Step 4: Inspect reviews and exact-head checks**

Resolve every actionable review thread, rerun CI after every head change, and require Node.js 22/24 CI, package contents, SAST, and Security Scan on the same head.

- [ ] **Step 5: Mark ready only after all implementation gates pass**

Do not convert from draft while repository verification, package contents, or any security check fails.

- [ ] **Step 6: Merge with expected-head protection**

Squash merge only after all required policies are satisfied. Re-query the PR, issue #21, open PR count, and main-branch workflow runs after merge.
