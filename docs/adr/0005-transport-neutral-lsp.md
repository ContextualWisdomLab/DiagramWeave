# ADR-0005: Keep Language Server feature semantics transport-neutral

**Status:** Accepted  
**Date:** 2026-08-09

The reusable Language Server package owns lifecycle, snapshots, diagnostics, capabilities, symbols, completion, folding, hover, and navigation semantics. The stdio package owns only bounded JSON-RPC framing, serialization, process lifecycle, and stable transport error mapping. Studio, IDE adapters, naruon, and future transports reuse the same session instead of duplicating feature logic.