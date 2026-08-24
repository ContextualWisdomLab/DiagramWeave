# ADR-0001: Keep source text and exact revision authoritative

**Status:** Accepted
**Date:** 2026-08-09
**Updated:** 2026-08-24

## Context

DiagramWeave is a source-first editor platform for PlantUML and later text
diagram languages. Hosts may cache editor buffers, previews, diagnostics,
outlines, and model suggestions, but those surfaces are derived. If a derived
view, hidden editor store, or generated artifact silently replaced the caller's
text, manual offline editing would no longer be the system of record.

PlantUML's own language documentation treats the textual description as the
input that produces a diagram (PlantUML, n.d.-a, n.d.-b). DiagramWeave therefore
needs a revision identifier that binds every derived result to one exact source
string. Core already computes that identifier as a lowercase SHA-256 digest of
the UTF-8 source. SHA-256 is specified by the Secure Hash Standard: any change
to the message produces, with very high probability, a different digest
(National Institute of Standards and Technology, 2015).

## Decision

Diagram source remains the system of record. Derived renderings, diagnostics,
symbols, model proposals, and previews bind to an exact SHA-256 source revision
and cannot silently replace the caller's source. Hosts own save, commit, and
persistence. This enables offline and manual operation and deterministic
stale-proposal rejection.

The foundation introduces no DiagramWeave-owned database. A host may persist
files, but it must write the exact accepted source rather than a reconstructed
or rendered substitute.

## Consequences

- Core `hashSource` remains the only revision algorithm for proposals, renderer
  artifacts, and CLI reports.
- A proposal, preview, or render whose base digest does not match the current
  source fails closed (`revision_conflict`); it is never patched onto newer
  text.
- Studio, naruon, IDE adapters, and other CWL hosts can embed Core without
  taking file I/O, network, or persistence into the trust kernel.
- Manual editing, validation, and local render stay usable without an account,
  network connection, or LLM.
- A later persistence design must keep source files authoritative and use
  descriptive two-word-or-longer `snake_case` object names.

## References — APA 7th edition

National Institute of Standards and Technology. (2015). *Secure Hash Standard
(SHS)* (FIPS PUB 180-4). U.S. Department of Commerce.
https://doi.org/10.6028/NIST.FIPS.180-4

PlantUML. (n.d.-a). *PlantUML*. Retrieved August 24, 2026, from
https://plantuml.com/

PlantUML. (n.d.-b). *PlantUML Language Reference Guide*. Retrieved August 24,
2026, from https://plantuml.com/guide
