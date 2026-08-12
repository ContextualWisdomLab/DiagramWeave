# ADR-0002: Keep generated edits as proposals

**Status:** Accepted
**Date:** 2026-08-09

Generated edits remain proposals until the host chooses to apply them. Core validates proposal shape, exact source revision, requested/effective ranges, and visible scope expansion. Manual editing works independently from any provider. This keeps source changes reviewable and avoids hidden mutation paths.
