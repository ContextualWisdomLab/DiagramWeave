# ADR-0003: Keep PlantUML rendering local, bounded, and isolated

**Status:** Accepted  
**Date:** 2026-08-09

The foundation renderer receives source through stdin, invokes host-supplied Java/PlantUML without a shell, uses an empty child environment and PlantUML SANDBOX, suppresses source metadata, and bounds source, output, diagnostics, and execution time. It does not download dependencies, follow includes, or fetch resources. Raw child output remains inside the renderer boundary; reusable callers receive validated artifacts and fixed safe diagnostics.