# ADR-0004: Reuse one authoritative conservative symbol tree

**Status:** Accepted  
**Date:** 2026-08-09

Document symbols, flat compatibility symbols, completion context, folding, hover, definition, and compatible later navigation features derive from one bounded conservative structural tree over the latest accepted source snapshot. Hierarchy is created only when complete explicit syntax proves ownership. Ambiguous PlantUML syntax fails by omission. This prevents feature-specific parsers from disagreeing about declarations and ranges.