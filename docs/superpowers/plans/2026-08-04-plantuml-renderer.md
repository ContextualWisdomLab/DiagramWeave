# Secure PlantUML Renderer Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development and complete each checkbox in order.

**Goal:** Add an offline-first PlantUML rendering package that consumes source through stdin, produces bounded SVG/PNG artifacts, runs PlantUML in `SANDBOX`, and never writes source to the filesystem or exposes source through generated metadata.

**Architecture:** A new zero-runtime-dependency package, `@contextualwisdomlab/diagramweave-plantuml-renderer`, owns Java/PlantUML process isolation. The host supplies absolute Java and PlantUML JAR paths. The renderer validates options and requests, spawns without a shell, passes source only through stdin, disables PlantUML metadata, caps stdout/stderr, enforces a deadline, validates output signatures, and returns an immutable JSON-serializable artifact. DiagramWeave Core remains the source revision authority; Studio, CLI, naruon, and other CWL hosts can reuse the renderer without importing an editor shell.

**Tech Stack:** Node.js 22/24 ESM, built-in `child_process.spawn`, Node test runner/coverage, npm workspaces, PlantUML command-line pipe mode.

**Primary references:** PlantUML official command-line documentation (`-pipe`, output formats, exit behavior, `-stdrpt`, source metadata controls), PlantUML official security profiles (`SANDBOX`), PlantUML official license FAQ, and Node.js official `child_process` documentation.

## Constraints

- Manual editing and local validation remain usable without an LLM.
- No PlantUML JAR is bundled in this slice; operators provide an absolute path and remain responsible for compatible licensing and notices.
- Use `-DPLANTUML_SECURITY_PROFILE=SANDBOX` before `-jar`.
- Use pipe mode; never write the source to a temporary file.
- Disable generated source metadata.
- Never invoke a shell or interpolate source into command-line arguments.
- Spawn with an empty child environment and an absolute Java executable path.
- Bound source bytes, output bytes, diagnostic bytes, and execution time.
- Return no raw stderr in public errors.
- Preserve 100% production statement, branch, function, and production JSDoc coverage.
- Update README, architecture, security model, CHANGELOG, package lock, and repository contracts.
- Do not release from this slice.

---

### Task 1: Specify the renderer package contract

**Files:**
- Create: `packages/plantuml-renderer/package.json`
- Create: `packages/plantuml-renderer/test/renderer.test.js`
- Modify: `tests/repository-contract.test.js`

- [x] Write failing tests for package presence and public exports.
- [x] Write failing tests for option and request validation.
- [x] Write failing tests for exact Java arguments and spawn options.
- [x] Run focused tests and confirm the package is absent.

### Task 2: Implement isolated rendering

**Files:**
- Create: `packages/plantuml-renderer/src/errors.js`
- Create: `packages/plantuml-renderer/src/renderer.js`
- Create: `packages/plantuml-renderer/src/index.js`

- [x] Implement stable renderer errors.
- [x] Implement absolute path, limit, format, and UTF-8 source validation.
- [x] Spawn Java with `shell: false`, empty environment, pipe stdio, SANDBOX, metadata disabled, standard report, and PNG/SVG output mode.
- [x] Bound stdout and stderr and terminate oversized work.
- [x] Enforce timeout and distinguish spawn, exit, output-size, and invalid-output failures.
- [x] Return an immutable base64 artifact with media type, byte length, and source revision hash.
- [x] Run focused tests and reach exact 100% production coverage.

### Task 3: Document security, operations, and modular reuse

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/security-model.md`
- Create: `docs/operations/plantuml-renderer.md`
- Modify: `CHANGELOG.md`
- Modify: `package-lock.json`

- [x] Document the host-supplied JAR and license gate.
- [x] Document SANDBOX, stdin-only processing, metadata disablement, limits, and error codes.
- [x] Document reuse from Studio, CLI, naruon, and CWL services.
- [x] Update repository contracts for required terminology.

### Task 4: Verify and publish one pull request

- [x] Run `npm ci --ignore-scripts --no-audit --no-fund`.
- [x] Run focused renderer tests.
- [x] Run `npm run verify` on the local supported runtime.
- [x] Confirm no skipped/todo tests and no untracked files.
- [ ] Create one PR against `main`.
- [ ] Inspect every exact-head check and review thread.
- [ ] Address valid feedback and rerun exact-head checks.
- [ ] Merge only after repository policy is satisfied.
