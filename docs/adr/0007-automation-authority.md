# ADR-0007: Separate autonomous development from review, merge, and release authority

**Status:** Accepted  
**Date:** 2026-08-09

Repository automation may collect exact-head evidence, run bounded model-assisted development, verify repository changes, and publish an ordinary branch/PR update. It must not manufacture independent approval, force-push over another writer, weaken required checks, merge protected branches, tag, publish packages, or release. Model credentials remain separate from reviewer/merge/release credentials. Active PR #24 refines hourly remediation under this governing boundary.