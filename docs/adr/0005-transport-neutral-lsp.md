# ADR-0005: Keep Language Server feature semantics transport-neutral

**Status:** Accepted
**Date:** 2026-08-09
**Updated:** 2026-08-24

## Context

DiagramWeave must expose the same editor intelligence to Studio, IDE adapters,
the `dweave-lsp` process, naruon, and other CWL hosts. Duplicating lifecycle,
snapshot, diagnostic, symbol, completion, folding, hover, or navigation logic
in each transport would create incompatible UTF-16 ranges and capability
behavior.

The Language Server Protocol specifies those feature semantics independently
of a particular byte transport and uses JSON-RPC messages with UTF-16 positions
by default (Microsoft, n.d.). JSON-RPC 2.0 is transport-agnostic: the same
request, notification, and error objects can move over stdio, sockets, or
in-process calls (JSON-RPC Working Group, 2013). Message bodies are JSON
(Bray, 2017). Document identifiers are URIs (Berners-Lee et al., 2005);
DiagramWeave treats a local file URI as an identifier and does not dereference
it.

## Decision

The reusable Language Server package owns lifecycle, snapshots, diagnostics,
capabilities, symbols, completion, folding, hover, and navigation semantics.
The stdio package owns only bounded JSON-RPC framing, serialization, process
lifecycle, and stable transport error mapping. Studio, IDE adapters, naruon,
and future transports reuse the same session instead of duplicating feature
logic.

Source arrives as full-document snapshots. The session never opens, watches,
or reads workspace files. Invalid completion and other parameter failures map
to JSON-RPC `-32602` Invalid params at the transport edge.

## Consequences

- Embedding hosts call the transport-neutral session API directly. Process
  hosts use `dweave-lsp` without a second feature implementation.
- Framing rejects malformed, oversized, duplicated, unsupported, or non-ASCII
  headers. Feature packages never parse Content-Length themselves.
- Capability negotiation stays in the session. Hostile getters and proxies
  fail closed to the safe presentation (for example, flat symbols).
- naruon remains a composition hub: it embeds the Language Server package and
  may optionally spawn stdio, without moving feature semantics into the
  transport.
- A later WebSocket, HTTP, or in-process host adapter must wrap this session
  rather than reimplement diagnostics or navigation.

## References — APA 7th edition

Berners-Lee, T., Fielding, R., & Masinter, L. (2005). *Uniform resource
identifier (URI): Generic syntax* (RFC 3986). RFC Editor.
https://doi.org/10.17487/RFC3986

Bray, T. (Ed.). (2017). *The JavaScript Object Notation (JSON) data interchange
format* (RFC 8259). RFC Editor. https://doi.org/10.17487/RFC8259

JSON-RPC Working Group. (2013). *JSON-RPC 2.0 specification*.
https://www.jsonrpc.org/specification

Microsoft. (n.d.). *Language Server Protocol specification, version 3.18*.
Retrieved August 24, 2026, from
https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/
