# Conservative PlantUML Hierarchical Document Symbols Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans task-by-task. Keep test-first order and do not weaken exact-head gates.

**Goal:** Upgrade DiagramWeave's explicit PlantUML outline from a flat declaration list to a conservative, deeply frozen hierarchy for complete indentation-matched declaration scopes.

**Architecture:** Keep the existing local declaration scanner and add a two-phase structural pass. Parse flat bounded declaration records first, match only complete unquoted brace scopes with same-indentation standalone closers, then construct frozen children bottom-up without recursion.

**Tech Stack:** Node.js 22/24, ECMAScript modules, built-in `node:test`, LSP 3.18, official PlantUML class/package syntax, GitHub Actions.

## Global constraints

- Preserve every existing explicit declaration family, label form, symbol kind, detail, UTF-16 selection range, resource limit, and fail-closed error code.
- Perform no LLM, renderer, file, URI, include, macro, shell, workspace, or network work.
- Infer no hierarchy from indentation alone.
- Match a scope only from one unmatched unquoted `{` on a declaration line and a later standalone `}` at identical indentation.
- Ignore ambiguous, unmatched, crossed, cross-indented, or multi-open structure.
- Construct and freeze the final tree without recursive traversal.
- Keep production line, branch, and function coverage at 100% and production JSDoc at 100%.
- Require Node.js 22/24 CI, exact package dry runs, SAST, Security Scan, CodeRabbit, and zero unresolved threads on one exact head before merge.
- Keep all packages at `0.0.0` under `Unreleased`.

---

### Task 1: Define failing hierarchy behavior

**Files:**
- Create: `packages/language-server/test/hierarchical-symbols.test.js`
- Modify later: `packages/language-server/test/symbols.test.js`

- [ ] Write a three-level package/namespace/class test with two root siblings.
- [ ] Assert source-order roots and siblings.
- [ ] Assert parent range containment and closing-line end positions.
- [ ] Assert deeply frozen root arrays, children arrays, symbols, ranges, and positions.
- [ ] Run the focused test and confirm the current flat scanner fails for missing `children` and scope ranges.

### Task 2: Specify conservative brace evidence

**Files:**
- Extend: `packages/language-server/test/hierarchical-symbols.test.js`

- [ ] Add quoted-label and escaped/doubled-quote brace cases that must not open scopes.
- [ ] Add line-comment and block-comment brace cases that must not affect scopes.
- [ ] Add a valid close with a trailing comment.
- [ ] Add balanced one-line, unmatched opener, unmatched closer, multiple unmatched openers, cross-indented closer, and crossed nested-scope cases that must remain flat.
- [ ] Add an unmatched outer scope containing a matched inner scope; only the proven inner interval may own children.
- [ ] Run the focused test and retain the expected red state.

### Task 3: Implement two-phase scope matching

**Files:**
- Modify: `packages/language-server/src/symbols.js`

- [ ] Refactor single-line range construction into a general UTF-16 source-range helper.
- [ ] Preserve flat declaration parsing in bounded internal records.
- [ ] Add an unquoted structural-brace scanner using existing quote escape rules.
- [ ] Detect same-indentation standalone closing lines after comment masking.
- [ ] Match scope intervals in stack order and record close line/end character only for proven pairs.
- [ ] Assign each declaration to the innermost matched interval that contains its line.
- [ ] Construct frozen symbols bottom-up in reverse declaration order.
- [ ] Add `children` only for symbols with proven descendants.
- [ ] Return a frozen source-order root array.
- [ ] Run the focused hierarchy tests.

### Task 4: Preserve flat and bounded contracts

**Files:**
- Modify: `packages/language-server/test/symbols.test.js`
- Extend: `packages/language-server/test/hierarchical-symbols.test.js`

- [ ] Update the existing mixed-diagram test to flatten the returned tree only for cross-family assertions.
- [ ] Assert that sources without matched scopes return the previous flat shape.
- [ ] Assert aliases, delimiters, multilingual text, emoji, CR, LF, and CRLF positions remain exact.
- [ ] Assert total symbol and symbol-name limits apply across roots and descendants.
- [ ] Add a deep bounded hierarchy test that does not recurse in product construction or test traversal.
- [ ] Run all Language Server tests and then `npm run coverage`.
- [ ] Add behavior tests for every reachable uncovered line or branch; do not delete valid guards to satisfy coverage.

### Task 5: Update standards, product, architecture, and operations records

**Files:**
- Create: `docs/research/plantuml-hierarchical-document-symbols.md`
- Create: `docs/operations/hierarchical-document-symbols.md`
- Create: `docs/product/hierarchical-document-outline.md`
- Modify: `packages/language-server/README.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/architecture.md`
- Modify: `docs/product/diagramweave-prd.md`
- Modify: `CHANGELOG.md`
- Create: `tests/hierarchical-symbols-repository-contract.test.js`

- [ ] Record LSP 3.18 `DocumentSymbol.children` and enclosing range semantics.
- [ ] Record official PlantUML nested package/namespace evidence in APA 7th form.
- [ ] Document conservative matching, ambiguity omission, limits, privacy, troubleshooting, and modular hosts.
- [ ] Document Figma/Product Design requirements for an accessible tree UI.
- [ ] Update PRD and changelog implementation status without claiming a release.
- [ ] Add executable repository-document contracts and run them.

### Task 6: Exact package and repository verification

**Files:**
- Verify: `.github/workflows/ci.yml`
- Verify: `scripts/check-package-contents.mjs`
- Verify: package manifests and lockfile

- [ ] Run `npm ci --ignore-scripts --no-audit --no-fund`.
- [ ] Run `npm run verify` and record test, syntax, coverage, and JSDoc totals.
- [ ] Run exact npm package dry runs for Language Server and stdio workspaces.
- [ ] Confirm Node.js 22 and 24 CI pass on the same head.
- [ ] Confirm SAST Semgrep, Security Scan, CodeRabbit, and review-thread gates pass on that head.

### Task 7: PR completion and next product loop

- [ ] Open one draft PR with the buyer-visible gap, bounded scope, standards record, and non-release status.
- [ ] Resolve every current-head review finding with tests first.
- [ ] Update the PR body with exact-head evidence.
- [ ] Mark ready only after implementation and documentation are complete.
- [ ] Re-read head SHA, workflow runs, combined status, and review threads.
- [ ] Squash merge using `expected_head_sha` without bypassing protection.
- [ ] Requery the open PR queue.
- [ ] If zero, select the next bounded buyer-visible editor-navigation gap and repeat the design, TDD, review, verification, and merge loop.
