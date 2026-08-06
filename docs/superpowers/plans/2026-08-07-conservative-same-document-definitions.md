# Conservative same-document PlantUML definitions implementation plan

> **Execution contract:** implement incrementally with TDD, preserve every existing capability, and do not merge until all exact-head gates succeed.

**Goal:** Add capability-gated LSP 3.18 `textDocument/definition` that navigates exact, unique, explicit same-document PlantUML identifiers to authoritative declaration selection ranges.

**Architecture:** A pure `definitions.js` engine derives conservative reference identifiers from declarations already proven by `documentSymbolsForSource`. A new `definition-session.js` outer layer composes over hover and owns accepted source snapshots with the existing epoch/sequence pattern. The stdio adapter remains unchanged because it delegates arbitrary supported requests to the transport-neutral session.

**Runtime:** Node.js 22/24, zero new runtime dependencies, full-document LSP synchronization, JavaScript UTF-16 coordinates.

---

## Task 1 — Establish deliberate RED evidence for the pure engine

**Files**

- Create: `packages/language-server/test/definitions.test.js`
- Expected missing implementation: `packages/language-server/src/definitions.js`

**Steps**

1. Add focused tests that import `definitionForSource` from the missing module.
2. Cover a minimal valid relation endpoint resolving to an explicit aliased declaration.
3. Cover a valid non-reference position returning `null`.
4. Push only the tests and verify hosted CI fails with `ERR_MODULE_NOT_FOUND` for `definitions.js`.
5. Keep the PR draft during the RED state.

## Task 2 — Implement the pure authoritative definition engine

**Files**

- Create: `packages/language-server/src/definitions.js`
- Extend: `packages/language-server/test/definitions.test.js`

**Steps**

1. Validate source, URI, and position with existing contracts and limits.
2. Split source without changing LF/CRLF/CR UTF-16 coordinates.
3. Call `documentSymbolsForSource(source)` and flatten iteratively.
4. Associate each authoritative symbol with its exact declaration line.
5. Parse only the three approved identifier forms:
   - bare declaration without `as`;
   - delimited display then safe bare alias;
   - safe bare alias then delimited display.
6. Require parsed display selection to match the authoritative symbol selection exactly.
7. Build a unique identifier map; mark duplicates ambiguous.
8. Mask comments and quoted text while preserving code-unit offsets.
9. Exclude `@`/`!` directives and message/relation label text.
10. Extract the exact identifier token containing the requested position.
11. Match only an identifier already present uniquely in the authoritative map.
12. Return a deeply frozen `{ uri, range }` using the authoritative selection range, or `null`.
13. Add exhaustive tests for supported families, alias orientations, newlines, Unicode, exact boundaries, nesting, relation/message/member positions, and omission cases.
14. Add hostile input and all limit-boundary tests until pure-engine production coverage is 100%.

## Task 3 — Establish deliberate RED evidence for the session layer

**Files**

- Create: `packages/language-server/test/definition-session.test.js`
- Expected missing implementation: `packages/language-server/src/definition-session.js`

**Steps**

1. Add tests for capability advertisement and one definition request through a direct session.
2. Add a test proving an unnegotiated session returns `method_not_found`.
3. Run the focused test and verify the expected missing-module failure before implementation.

## Task 4 — Implement capability negotiation and revision-safe snapshots

**Files**

- Create: `packages/language-server/src/definition-session.js`
- Extend: `packages/language-server/test/definition-session.test.js`

**Steps**

1. Compose the new layer over an injected or default hover session.
2. Treat only a valid plain `textDocument.definition` capability as support.
3. Advertise `definitionProvider: true` without mutating inner capabilities.
4. Normalize standard definition params through existing URI/position contracts.
5. Mirror only accepted didOpen/didChange snapshots.
6. Reuse epoch and monotonically increasing per-document sequence ordering.
7. Delete snapshots on accepted close and clear all state on shutdown, exit, and disposal.
8. Delegate all unrelated requests/notifications unchanged.
9. Normalize hostile capability, request, and mutation boundaries to stable source-free errors.
10. Cover rejected newer mutations, older pending success, stale renderer completion, close-during-validation, lifecycle, and direct hostile boundaries.
11. Drive line/branch/function coverage to 100%.

## Task 5 — Compose and export the public capability

**Files**

- Modify: `packages/language-server/src/index.js`
- Modify: `packages/language-server/package.json`
- Modify: `packages/language-server/test/package-contract.test.js`
- Add or modify repository contract tests as required.

**Steps**

1. Compose definition over hover in `createLanguageServerSession`.
2. Export `createDefinitionLanguageServerSession` and `definitionForSource`.
3. Preserve all existing public exports.
4. Update exact package-content expectations for the two new source modules.
5. Add contract tests proving definition remains the public outer layer and all inner capabilities survive.
6. Verify no temporary implementation workflow or payload enters the package.

## Task 6 — Add real stdio parity

**Files**

- Create or modify: `packages/language-server-stdio/test/definition.test.js`
- Modify package/repository contract tests only if necessary.

**Steps**

1. Send initialize with definition capability through the real bounded Content-Length transport.
2. Open a document containing one explicit alias and one reference.
3. Request the reference definition and assert the exact `Location`.
4. Verify method-not-found when definition was not negotiated.
5. Verify malformed definition positions map to fixed JSON-RPC Invalid params.
6. Complete shutdown and exit without calling `process.exit`.

## Task 7 — Update durable standards, product, and operations records

**Files**

- Create: `docs/research/plantuml-declaration-definitions.md`
- Create: `docs/product/declaration-definitions.md`
- Create: `docs/operations/declaration-definitions.md`
- Modify: `README.md`
- Modify: `packages/language-server/README.md`
- Modify: `packages/language-server-stdio/README.md`
- Modify: `docs/product/diagramweave-prd.md`
- Modify: `docs/architecture.md`
- Modify: `docs/security-model.md`
- Modify: `CHANGELOG.md`
- Modify repository documentation contract tests.

**Steps**

1. Record LSP 3.18 definition contracts and official PlantUML alias semantics in APA 7th format.
2. Document accepted identifier forms and every omission boundary.
3. Document initialize, synchronization, request, response, lifecycle, error, privacy, and modular-host behavior.
4. Mark only the same-document definition portion of FR-012 implemented; keep references and rename incomplete.
5. State that no Figma artifact is required for this backend slice and name the future Studio interactions that require Product Design.
6. Add the feature under `Unreleased`; do not bump package versions.

## Task 8 — Complete exact verification and PR lifecycle

**Commands / gates**

1. `npm ci --ignore-scripts --no-audit --no-fund`
2. `npm run syntax`
3. `node --test packages/language-server/test/definitions.test.js`
4. `node --test packages/language-server/test/definition-session.test.js`
5. `node --test packages/language-server-stdio/test/definition.test.js`
6. `npm run test`
7. `npm run coverage`
8. `npm run docstrings`
9. `npm run verify`
10. Exact workspace package dry runs through the repository package-content gate.
11. Confirm zero failed, skipped, todo, ignored, or expected-failure tests.
12. Confirm production line, branch, and function coverage each equal 100%.
13. Confirm production JSDoc coverage equals 100%.
14. Remove every temporary write-enabled workflow or payload before the final candidate head.
15. Mark the PR ready only after local/hosted implementation verification.
16. Resolve every actionable review thread.
17. Require exact-head CI on Node 22/24, SAST Semgrep, Security Scan, review status, and zero unresolved threads.
18. Squash-merge with an expected-head SHA guard only while all exact-head evidence remains valid.
19. Verify issue #19 closes and the open PR count returns to zero.
20. Inspect post-merge main checks before selecting the next buyer-visible gap.
