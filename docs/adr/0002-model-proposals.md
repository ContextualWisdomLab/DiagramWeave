# ADR-0002: Keep generated edits as proposals

**Status:** Accepted
**Date:** 2026-08-09
**Updated:** 2026-08-24

## Context

Model output, included diagram content, comments, and labels are untrusted data.
A generated edit that wrote files, committed, or silently mutated the buffer
would violate source authority (ADR-0001) and make manual editing depend on a
provider.

The product contract is that AI proposes and the host decides. Core therefore
needs a reviewable value type, not a mutation API. Assistant content arrives as
JSON text that must be parsed strictly before any range math. JSON is specified
as a text-based interchange format with a closed set of structural rules (Bray,
2017). The proposal then binds to the exact SHA-256 digest of the source from
which it was produced (National Institute of Standards and Technology, 2015).

## Decision

Generated edits remain proposals until the host chooses to apply them. Core
validates proposal shape, exact source revision, requested and effective
ranges, and visible scope expansion. Manual editing works independently from
any provider. This keeps source changes reviewable and avoids hidden mutation
paths.

`previewEditProposal` and `applyEditProposal` return new strings. They do not
save, commit, push, render, or execute. An effective range outside the
requested range requires an explicit expansion reason and host approval.

## Consequences

- Studio, naruon, IDE adapters, and CLI hosts display a diff and invoke Core
  separately; receiving a proposal does not change a document.
- Stale proposals fail with `revision_conflict`. Expanded edits fail with
  `scope_expansion_required` unless `allowScopeExpansion` is explicit.
- Provider adapters may only emit Core-validated `EditProposal` values. They
  cannot add a second apply path.
- Manual editing, local render, and editor intelligence remain complete
  without an LLM.
- Future apply-on-save or auto-commit behavior would require a new ADR and
  would break this decision.

## References — APA 7th edition

Bray, T. (Ed.). (2017). *The JavaScript Object Notation (JSON) data interchange
format* (RFC 8259). RFC Editor. https://doi.org/10.17487/RFC8259

National Institute of Standards and Technology. (2015). *Secure Hash Standard
(SHS)* (FIPS PUB 180-4). U.S. Department of Commerce.
https://doi.org/10.6028/NIST.FIPS.180-4
