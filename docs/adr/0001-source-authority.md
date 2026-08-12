# ADR-0001: Keep source text and exact revision authoritative

**Status:** Accepted
**Date:** 2026-08-09

Diagram source remains the system of record. Derived renderings, diagnostics, symbols, model proposals, and previews bind to an exact SHA-256 source revision and cannot silently replace the caller's source. Hosts own save/commit/persistence. This enables offline/manual operation and deterministic stale-proposal rejection.
