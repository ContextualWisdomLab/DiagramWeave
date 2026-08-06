# Evidence-Bounded Declaration Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add capability-negotiated, evidence-bounded LSP 3.18 declaration hover derived only from DiagramWeave's authoritative PlantUML document-symbol tree.

**Architecture:** A pure iterative hover engine consumes `documentSymbolsForSource`, and an outer hover session composes the existing folding session while mirroring only accepted source snapshots. The public entry point changes from the folding session to the hover session without changing inner diagnostics, symbol, completion, folding, stdio, naruon, or modular-host behavior.

**Tech Stack:** Node.js 22/24, ECMAScript modules, Node test runner, LSP 3.18 JSON structures, existing DiagramWeave Language Server and bounded stdio packages.

## Global Constraints

- Production arithmetic and parsing remain local JavaScript; no new dependency is permitted.
- Production line, branch, and function coverage must remain exactly 100%.
- Production JSDoc coverage must remain exactly 100%.
- No skipped, ignored, todo, or expected-failure test is permitted.
- All public records and nested response records must be deeply frozen.
- All positions use zero-based UTF-16 code units.
- Only a valid plain `capabilities.textDocument.hover` record enables the feature.
- Supported markup kinds are exactly `plaintext` and `markdown`.
- No LLM, renderer, filesystem, include, macro, shell, workspace, or network work is permitted.
- Packages remain `0.0.0` under `Unreleased`; do not publish a release.
- Figma is not required for this backend-only protocol slice.

---

## File map

### Create

- `packages/language-server/src/declaration-hover.js` — pure declaration-hover engine and Markdown fencing.
- `packages/language-server/src/hover-session.js` — LSP capability, lifecycle, request, and accepted-snapshot wrapper.
- `packages/language-server/test/declaration-hover.test.js` — pure-engine correctness, bounds, security, UTF-16, and deep-tree tests.
- `packages/language-server/test/hover-session.test.js` — capability, lifecycle, hostile-boundary, and race tests.
- `packages/language-server-stdio/test/hover.test.js` — real JSON-RPC stdio behavior.
- `docs/product/declaration-hover.md` — buyer-facing product contract.
- `docs/operations/declaration-hover.md` — host integration, lifecycle, failure, and recovery guide.
- `docs/research/plantuml-declaration-hover.md` — LSP and PlantUML APA 7th evidence.
- `tests/declaration-hover-repository-contract.test.js` — durable repository, package, standards, and architecture contract.

### Modify

- `packages/language-server/src/index.js` — expose hover session as the public session.
- `packages/language-server/package.json` — describe hover in the independently reusable package.
- `packages/language-server/README.md` — document capability, request, response, safety, and residual gaps.
- `packages/language-server-stdio/README.md` — document stdio parity and unsupported-client behavior.
- `packages/language-server/test/package-contract.test.js` — lock the public outer session and package description.
- `scripts/check-package-contents.mjs` — include the two new production files.
- `README.md` — surface declaration hover in the product foundation and documentation index.
- `docs/product/diagramweave-prd.md` — mark bounded declaration hover implemented while preserving later semantic navigation gaps.
- `docs/architecture.md` — add hover composition, trust boundary, data flow, compatibility, and non-responsibilities.
- `ARCHITECTURE.md` — surface the new ADR/design/research/operations records.
- `CHANGELOG.md` — record the unreleased user-facing capability.

---

### Task 1: Define the pure hover contract with failing tests

**Files:**
- Create: `packages/language-server/test/declaration-hover.test.js`
- Create later: `packages/language-server/src/declaration-hover.js`

**Interfaces:**
- Consumes: `documentSymbolsForSource(source)` from `src/symbols.js`, `isPlainRecord(value)` from `src/contracts.js`, and `LanguageServerError`.
- Produces: `declarationHoverForSource(source, position, markupKind): Readonly<object>|null`.

- [ ] **Step 1: Write the failing pure-engine tests**

Cover these exact behaviors:

```js
const source = [
  'package Platform {',
  '  namespace api {',
  '    abstract class "API Gateway" as Gateway',
  '  }',
  '}',
].join('\n');

assert.deepEqual(
  declarationHoverForSource(source, { line: 2, character: 21 }, 'plaintext'),
  {
    contents: {
      kind: 'plaintext',
      value: [
        'PlantUML abstract class declaration',
        'Name: API Gateway',
        'Container: api',
      ].join('\n'),
    },
    range: {
      start: { line: 2, character: 20 },
      end: { line: 2, character: 31 },
    },
  },
);
```

Also assert:

- root declarations omit `Container`;
- the start character matches and the exclusive end returns `null`;
- positions on keywords, whitespace, braces, relations, members, directives, comments, and malformed declarations return `null`;
- LF, CRLF, and CR preserve the same line and UTF-16 selection coordinates;
- multilingual and emoji labels preserve exact coordinates;
- markdown uses a `text` code fence longer than every backtick run in name/container text;
- response, `contents`, `range`, and both positions are frozen;
- repeated no-match calls return `null`;
- invalid source errors from `documentSymbolsForSource` are preserved;
- invalid markup kind returns stable `invalid_request`;
- non-plain, hostile, negative, fractional, oversized, and out-of-document positions return stable `document_position_invalid`;
- a 512-level package hierarchy resolves the leaf iteratively and reports only its immediate parent.

- [ ] **Step 2: Run the focused test and prove RED**

Run:

```bash
node --test packages/language-server/test/declaration-hover.test.js
```

Expected: failure with `ERR_MODULE_NOT_FOUND` for `../src/declaration-hover.js`.

- [ ] **Step 3: Commit the failing test**

```bash
git add packages/language-server/test/declaration-hover.test.js
git commit -m "test(language-server): define evidence-bounded declaration hover"
```

---

### Task 2: Implement the pure iterative hover engine

**Files:**
- Create: `packages/language-server/src/declaration-hover.js`
- Test: `packages/language-server/test/declaration-hover.test.js`

**Interfaces:**
- Consumes: the Task 1 tests and `documentSymbolsForSource` frozen symbol tree.
- Produces: `declarationHoverForSource(source, position, markupKind)`.

- [ ] **Step 1: Implement strict position normalization**

Create an internal function with this contract:

```js
function normalizedPositionForSource(source, candidate) {
  if (!isPlainRecord(candidate)) {
    throw new LanguageServerError(
      'document_position_invalid',
      'The document position is invalid.',
      { field: 'position', method: 'textDocument/hover' },
    );
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
    throw new LanguageServerError(
      'document_position_invalid',
      'The document position is invalid.',
      { field: 'position', method: 'textDocument/hover' },
    );
  }
  return Object.freeze({ line, character });
}
```

Wrap property access in a hostile boundary so throwing getters and revoked proxies collapse to the same public error.

- [ ] **Step 2: Implement iterative symbol matching**

Use a stack of `{ symbol, parentName }` records. Push roots in reverse order and children in reverse order so traversal remains source preorder without recursion. Match only when:

```js
position.line === symbol.selectionRange.start.line &&
position.line === symbol.selectionRange.end.line &&
position.character >= symbol.selectionRange.start.character &&
position.character < symbol.selectionRange.end.character
```

Carry `symbol.name` as `parentName` only when pushing children. Because only package and namespace symbols can own children in the authoritative tree, the recorded parent is always a proven grouping container.

- [ ] **Step 3: Implement bounded plaintext**

Create lines exactly as follows:

```js
const lines = [
  `PlantUML ${symbol.detail} declaration`,
  `Name: ${symbol.name}`,
];
if (parentName !== null) {
  lines.push(`Container: ${parentName}`);
}
```

The existing symbol-name limit bounds each dynamic field. Do not add labels, documentation URLs, inferred semantics, aliases not selected as the display label, or renderer output.

- [ ] **Step 4: Implement non-terminable markdown fencing**

Find the longest contiguous run of backticks in the plaintext value, choose `Math.max(3, longestRun + 1)`, and return:

```js
`${fence}text\n${plainText}\n${fence}`
```

Validate `markupKind` before scanning. Accept only `plaintext` or `markdown`; otherwise throw `LanguageServerError('invalid_request', ...)` with safe field metadata.

- [ ] **Step 5: Deeply freeze the result**

Reuse the already frozen `symbol.selectionRange`, and create:

```js
Object.freeze({
  contents: Object.freeze({ kind: markupKind, value }),
  range: symbol.selectionRange,
})
```

- [ ] **Step 6: Run the focused test and prove GREEN**

```bash
node --test packages/language-server/test/declaration-hover.test.js
```

Expected: every pure-engine test passes.

- [ ] **Step 7: Commit the pure engine**

```bash
git add packages/language-server/src/declaration-hover.js packages/language-server/test/declaration-hover.test.js
git commit -m "feat(language-server): derive declaration hover from symbol evidence"
```

---

### Task 3: Define the hover session contract with failing tests

**Files:**
- Create: `packages/language-server/test/hover-session.test.js`
- Create later: `packages/language-server/src/hover-session.js`

**Interfaces:**
- Consumes: `declarationHoverForSource` and `createFoldingLanguageServerSession`.
- Produces: `createHoverLanguageServerSession(options)`.

- [ ] **Step 1: Write lifecycle and capability tests**

The test suite must prove:

- `textDocument/hover` before initialize fails `server_not_initialized`;
- a plain hover capability advertises frozen `hoverProvider: true`;
- request before `initialized` fails `server_not_ready`;
- request before open fails `document_not_open`;
- open, change, and close serve the latest accepted source;
- no `contentFormat` negotiates `plaintext`;
- `['markdown', 'plaintext']` negotiates `markdown`;
- `['plaintext', 'markdown']` negotiates `plaintext`;
- unsupported, empty, oversized, non-string, array-valued capability paths, throwing getters, proxied arrays, and revoked proxies do not advertise hover and requests fail `method_not_found`;
- malformed textDocument and position records fail stable errors without dynamic values;
- remote URI fails `document_uri_invalid`;
- valid out-of-range positions fail `document_position_invalid`;
- shutdown, exit, and disposal fail `server_shutting_down`;
- rejected open/change/close mutations preserve the last accepted hover snapshot;
- a rejected newer open does not suppress an earlier pending valid open;
- a newer successful change supersedes an older renderer completion;
- close during validation prevents source resurrection;
- hostile direct open/change/close notification boundaries are covered at this outer layer.

- [ ] **Step 2: Run the focused test and prove RED**

```bash
node --test packages/language-server/test/hover-session.test.js
```

Expected: failure with `ERR_MODULE_NOT_FOUND` for `../src/hover-session.js`.

- [ ] **Step 3: Commit the failing session test**

```bash
git add packages/language-server/test/hover-session.test.js
git commit -m "test(language-server): define declaration-hover session"
```

---

### Task 4: Implement capability negotiation and the outer hover session

**Files:**
- Create: `packages/language-server/src/hover-session.js`
- Test: `packages/language-server/test/hover-session.test.js`

**Interfaces:**
- Consumes: `createFoldingLanguageServerSession(options)` and `declarationHoverForSource`.
- Produces: the frozen session API with `request`, `notify`, and `dispose`.

- [ ] **Step 1: Implement bounded client negotiation**

Create `hoverOptionsForClient(params)` under a `try/catch` hostile boundary.

- Require a plain `params.capabilities.textDocument.hover` record.
- If `contentFormat` is `undefined`, return frozen `{ markupKind: 'plaintext' }`.
- Otherwise require `Array.isArray(contentFormat)`, length `1..16`, and only string entries.
- Select the first `markdown` or `plaintext` entry.
- Return `null` when no supported format is present or any access fails.

Do not retain caller-owned arrays or records.

- [ ] **Step 2: Implement immutable capability advertisement**

Add `hoverProvider: true` to a copied and frozen capability record after the inner initialize request succeeds.

- [ ] **Step 3: Normalize open, change, close, and hover request inputs**

Follow the exact established full-document synchronization rules from `folding-session.js`:

- open: URI, language ID, version, text;
- change: one full-document change, no `range` or `rangeLength`;
- close: local text-document identifier;
- hover: local text-document identifier plus copied position record.

Preserve existing `LanguageServerError` instances and collapse hostile outer records to fixed source-free errors.

- [ ] **Step 4: Implement lifecycle and accepted-snapshot ordering**

Compose `createFoldingLanguageServerSession(options)` and duplicate only the proven outer-layer state machine:

- `initialized`, `ready`, `hoverOptions`, `shutdownRequested`, `exited`;
- `documents`, `activeMutations`, `lastAppliedSequence`;
- `epoch`, `mutationSequence`;
- `beginMutation`, `isCurrentMutation`, `finishMutation`, `markApplied`, `invalidateDocuments`.

For `textDocument/hover`, require lifecycle, require negotiated support, normalize params, require an open document, and call `declarationHoverForSource(record.text, position, markupKind)`.

- [ ] **Step 5: Run focused tests**

```bash
node --test \
  packages/language-server/test/declaration-hover.test.js \
  packages/language-server/test/hover-session.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit the session**

```bash
git add packages/language-server/src/hover-session.js packages/language-server/test/hover-session.test.js
git commit -m "feat(language-server): serve capability-gated declaration hover"
```

---

### Task 5: Make hover the public package session and lock package contents

**Files:**
- Modify: `packages/language-server/src/index.js`
- Modify: `packages/language-server/package.json`
- Modify: `packages/language-server/test/package-contract.test.js`
- Modify: `scripts/check-package-contents.mjs`

**Interfaces:**
- Consumes: `createHoverLanguageServerSession`.
- Produces: public `createLanguageServerSession` with all earlier features plus hover.

- [ ] **Step 1: Update the public entry point**

Replace the folding alias with:

```js
export {
  createHoverLanguageServerSession as createLanguageServerSession,
} from './hover-session.js';
```

Do not export internal normalization helpers.

- [ ] **Step 2: Update the package description**

Name diagnostics, negotiated outlines, declaration completion, folding, and declaration hover in one sentence. Keep version, export path, dependency, engine, files, and sideEffects unchanged.

- [ ] **Step 3: Update package contract tests**

Require the exact hover alias and package description terms. Continue requiring stable error and limit exports and continue excluding internal contract helpers.

- [ ] **Step 4: Update exact package contents**

Add, in sorted logical order:

```text
package/src/declaration-hover.js
package/src/hover-session.js
```

- [ ] **Step 5: Run package tests and dry-run checks**

```bash
node --test packages/language-server/test/package-contract.test.js
node scripts/check-package-contents.mjs
```

Expected: both pass.

- [ ] **Step 6: Commit package integration**

```bash
git add \
  packages/language-server/src/index.js \
  packages/language-server/package.json \
  packages/language-server/test/package-contract.test.js \
  scripts/check-package-contents.mjs
git commit -m "build(language-server): publish declaration hover"
```

---

### Task 6: Prove real stdio parity

**Files:**
- Create: `packages/language-server-stdio/test/hover.test.js`
- Modify: `packages/language-server-stdio/README.md`

**Interfaces:**
- Consumes: the existing bounded stdio connection and public Language Server session.
- Produces: verified `textDocument/hover` JSON-RPC behavior over Content-Length framing.

- [ ] **Step 1: Write the real transport test**

Follow existing completion, document-symbol, and folding stdio tests. Send framed initialize, initialized, didOpen, hover, shutdown, and exit messages. Assert:

- initialize advertises `hoverProvider: true`;
- a declaration-label hover returns the exact frozen-equivalent JSON shape and range;
- a non-label hover returns JSON `null`;
- a client that omitted hover receives fixed JSON-RPC method-not-found;
- malformed positions map to JSON-RPC invalid params without source or URI values;
- notification ordering remains unchanged.

- [ ] **Step 2: Run the real transport test**

```bash
node --test packages/language-server-stdio/test/hover.test.js
```

Expected: pass.

- [ ] **Step 3: Document stdio parity**

Add hover to the supported capability list, explain plaintext/markdown negotiation, and state that the adapter serializes the same transport-neutral result without duplicating source snapshots.

- [ ] **Step 4: Commit stdio evidence**

```bash
git add packages/language-server-stdio/test/hover.test.js packages/language-server-stdio/README.md
git commit -m "test(stdio): verify declaration hover end to end"
```

---

### Task 7: Publish product, operations, and research records

**Files:**
- Create: `docs/product/declaration-hover.md`
- Create: `docs/operations/declaration-hover.md`
- Create: `docs/research/plantuml-declaration-hover.md`
- Modify: `packages/language-server/README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: the implemented capability and tests.
- Produces: user, host, operator, and standards evidence.

- [ ] **Step 1: Write the product slice**

Include buyer problem, users, jobs, functional requirements, exact output, accessibility, security/privacy, Product Design boundary, quality acceptance, non-goals, and success signal.

- [ ] **Step 2: Write the operations guide**

Include initialize example, hover request/response, unsupported-client behavior, latest accepted snapshot behavior, lifecycle, source-free errors, security/privacy, troubleshooting, host checklist, observability boundaries, rollback, and references.

- [ ] **Step 3: Write the research record**

Distinguish normative standards from PlantUML product syntax. Record LSP 3.18 hover capability, `MarkupContent`, optional range, client format preference, PlantUML declaration and alias behavior, conservative omissions, and APA 7th references.

- [ ] **Step 4: Update package README**

Add hover to overview, capability list, initialize example, request example, response contract, immutable public records, latest-snapshot behavior, security boundaries, and remaining non-goals.

- [ ] **Step 5: Update CHANGELOG**

Add one `Unreleased / Added` bullet describing capability negotiation, exact selection-range evidence, immediate container context, plaintext/markdown safety, accepted-snapshot protection, stdio parity, and absence of model/renderer/file/network work.

- [ ] **Step 6: Commit durable records**

```bash
git add \
  docs/product/declaration-hover.md \
  docs/operations/declaration-hover.md \
  docs/research/plantuml-declaration-hover.md \
  packages/language-server/README.md \
  CHANGELOG.md
git commit -m "docs: publish declaration-hover contracts"
```

---

### Task 8: Integrate root product, PRD, and normative architecture

**Files:**
- Modify: `README.md`
- Modify: `docs/product/diagramweave-prd.md`
- Modify: `docs/architecture.md`
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Consumes: all implemented and documented behavior.
- Produces: consistent product and ADR baseline.

- [ ] **Step 1: Update root README**

Add hover to package summaries, initialize example, session features, Studio/IDE/naruon composition, trust-kernel rules, product status, and documentation indexes.

- [ ] **Step 2: Update PRD**

Mark bounded explicit-declaration hover implemented under FR-011/FR-072. Keep relation hover, completion resolve, semantic member completion, definition, references, rename, arbitrary region folding, and workspace indexing explicitly unimplemented.

- [ ] **Step 3: Update normative architecture**

Add the outer layer:

```text
hover-session
  -> folding-session
    -> completion-session
      -> document-symbol session
        -> diagnostic session
```

Document capability negotiation, immutable response data, iterative authoritative-tree traversal, accepted-snapshot ordering, security boundaries, data flow, non-responsibilities, compatibility, and testing evidence.

- [ ] **Step 4: Update ADR index**

Link the design, plan, product, operations, and research records and name hover in the architectural foundation summary.

- [ ] **Step 5: Commit root integration**

```bash
git add README.md docs/product/diagramweave-prd.md docs/architecture.md ARCHITECTURE.md
git commit -m "docs: integrate evidence-bounded declaration hover"
```

---

### Task 9: Lock repository-level contracts

**Files:**
- Create: `tests/declaration-hover-repository-contract.test.js`

**Interfaces:**
- Consumes: source, tests, package contract, and documentation records.
- Produces: executable prevention of undocumented or partial feature removal.

- [ ] **Step 1: Write repository contract tests**

Read the relevant source and documentation files and assert:

- both production files and both focused test files exist;
- public `index.js` composes hover over folding;
- package contents include both production files;
- root and package READMEs name `textDocument/hover`, `hoverProvider`, `plaintext`, `markdown`, UTF-16, naruon, and no renderer/LLM/file/network work;
- PRD marks declaration hover implemented and preserves later gaps;
- architecture documents iterative authoritative-tree reuse and accepted-snapshot ordering;
- product, operations, research, design, and plan records exist;
- CHANGELOG names the feature;
- research contains the LSP 3.18 and official PlantUML APA 7th references;
- Product Design/Figma boundary is explicit;
- no `COPILOT_GITHUB_TOKEN` is introduced.

- [ ] **Step 2: Run the repository contract test**

```bash
node --test tests/declaration-hover-repository-contract.test.js
```

Expected: pass.

- [ ] **Step 3: Commit the contract**

```bash
git add tests/declaration-hover-repository-contract.test.js
git commit -m "test(repository): lock declaration-hover evidence"
```

---

### Task 10: Full exact-head verification and PR handoff

**Files:**
- No new product files unless verification exposes a defect.

**Interfaces:**
- Consumes: the complete branch.
- Produces: one reviewable pull request that closes #16.

- [ ] **Step 1: Run syntax and focused tests**

```bash
npm ci --ignore-scripts --no-audit --no-fund
node --test \
  packages/language-server/test/declaration-hover.test.js \
  packages/language-server/test/hover-session.test.js \
  packages/language-server-stdio/test/hover.test.js \
  tests/declaration-hover-repository-contract.test.js
npm run syntax
```

Expected: pass.

- [ ] **Step 2: Run the entire repository verification**

```bash
npm run verify
```

Expected:

- every test passes;
- zero failed, skipped, cancelled, or todo tests;
- production line, branch, and function coverage are 100%;
- production JSDoc check passes.

- [ ] **Step 3: Run exact package-content verification**

```bash
node scripts/check-package-contents.mjs
git diff --check
```

Expected: both pass.

- [ ] **Step 4: Review branch scope**

```bash
git status --short
git diff --stat main...HEAD
git log --oneline main..HEAD
```

Expected: one bounded hover slice, no temporary workflow, no generated artifact, no dependency drift, no version bump.

- [ ] **Step 5: Open a draft PR**

Use title:

```text
feat: add evidence-bounded PlantUML declaration hover
```

The body must include buyer-visible gap, standards basis, implemented contract, TDD evidence, exact verification, Product Design boundary, security/privacy, residual non-goals, release status, and `Closes #16`.

- [ ] **Step 6: Review, repair, revalidate, and merge**

For every review thread or failed Check:

1. reproduce or inspect the exact failure;
2. identify the root cause before changing code;
3. add or correct a failing regression test;
4. make the smallest coherent repair;
5. rerun focused tests, `npm run verify`, package contents, and `git diff --check`;
6. resolve only addressed threads;
7. obtain CI, SAST, Security Scan, CodeRabbit, and required independent review on one exact head;
8. mark ready and merge only with the expected head SHA;
9. confirm #16 closed and open PR inventory returned to zero.
