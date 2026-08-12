# ADR-0006: Keep model access behind an optional orchestrator adapter

**Status:** Accepted
**Date:** 2026-08-09

DiagramWeave Core and local editing/rendering/editor intelligence do not depend on an LLM. Remote generated-edit capability is isolated behind the Contextual Orchestrator adapter with explicit endpoint, model, token, request bounds, timeout, and strict proposal parsing. Other provider strategies can be added through equivalent adapters without changing Core mutation/revision semantics.
