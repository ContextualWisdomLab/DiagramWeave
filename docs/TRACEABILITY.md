# DiagramWeave Requirements and Evidence Traceability

**Status:** Accepted baseline  
**Last reviewed:** 2026-08-09

This matrix connects durable product/architecture requirements to the canonical source boundary and representative evidence. Slice-specific product/research/operations documents remain valuable but do not replace cross-cutting traceability.

| Requirement / decision | Canonical basis | Source boundary | Representative evidence | Maturity |
|---|---|---|---|---|
| source is authoritative | PRD; ADR-0001 | Core + host boundary | revision/hash/preview/apply tests | implemented-main |
| AI proposes, never implicitly mutates | PRD; ADR-0002 | Core + Orchestrator adapter | strict proposal/stale/scope tests | implemented-main |
| provider-neutral optional model boundary | Architecture; ADR-0006 | contextual-orchestrator adapter | endpoint/request/timeout/response tests | implemented-main |
| local renderer is sandboxed/non-networked | Architecture; ADR-0003 | PlantUML renderer | spawn/env/SANDBOX/output/deadline/diagnostic tests | implemented-main |
| safe reusable diagnostics | Architecture/security model | renderer/diagnostic contracts | fixed-message/frozen/source-free tests | implemented-main |
| deterministic CLI filesystem safety | product/CLI docs | CLI | symlink/collision/atomic publication tests | implemented-main |
| transport-neutral LSP | PRD; ADR-0005 | language-server | lifecycle/snapshot/capability tests | implemented-main |
| one authoritative symbol tree | Architecture; ADR-0004 | language-server | hierarchy/flat/completion/folding/hover/definition tests | implemented-main |
| same-document definition | product/research/operations docs | language-server | exact UTF-16/ambiguity/stdio parity tests | implemented-main |
| same-document references | PR #22 | language-server | PR #22 exact-head tests/CI | active-PR |
| work-conserving hourly remediation | PR #24; ADR-0007 | GitHub workflows | PR #24 workflow-contract and exact-head CI/security evidence | active-PR |
| exact 100% line/branch/function/JSDoc | quality contract | production workspace packages | `npm run verify`, Node 22/24 CI | implemented-main |
| Studio visual editor | PRD/Architecture | future host | no protected-main product code yet | future-host |
| foundation persistence | ERD/TRD | none | explicit no-database boundary | not-applicable-current |

## Standards/research location

Feature-specific standards and primary technical references are recorded under `docs/research/` and linked from corresponding product/operations documents. LSP behavior is grounded in the Language Server Protocol 3.18 contract; PlantUML behavior uses its documented sandbox/report boundaries; source/hash/proposal decisions are repository product contracts. APA-style research/standard references should remain with the authoritative research/doctoring record for each material feature.

## Promotion rule

A feature moves from `active-PR` or `future-host` to `implemented-main` only after its implementing commit is present on protected main and fresh required evidence exists. PR descriptions, local-only runs, predecessor-head CI, queued checks, rate-limited reviews, or architecture diagrams cannot promote maturity.

## Documentation-change rule

Every material source PR should update affected traceability rows or add a row. If a requirement is superseded, retain the historical ADR/product record and point to the new decision rather than silently rewriting history.