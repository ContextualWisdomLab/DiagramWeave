#!/usr/bin/env node
/** Explicitly delegate DiagramWeave proposal execution to auto policy. */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientPath = resolve(
  root,
  'packages/contextual-orchestrator/src/client.js',
);
const changelogPath = resolve(root, 'CHANGELOG.md');
const adrPath = resolve(
  root,
  'docs/adr/0008-adaptive-contextual-orchestrator-default.md',
);

let client = readFileSync(clientPath, 'utf8');
const desired = "            orchestration_mode: 'auto',\n";
if (!client.includes(desired)) {
  const anchor = '            model: normalized.model,\n';
  const matches = client.split(anchor).length - 1;
  if (matches !== 1) {
    throw new Error(`expected one request model anchor, found ${matches}`);
  }
  client = client.replace(anchor, `${anchor}${desired}`);
}
client = client.replace(
  'The client sends an OpenAI-compatible non-streaming chat request, enforces a',
  'The client sends an OpenAI-compatible non-streaming request with explicit adaptive orchestration, enforces a',
);
writeFileSync(clientPath, client, 'utf8');

if (!existsSync(adrPath)) {
  writeFileSync(
    adrPath,
    `# ADR-0008: Diagram edit proposals use contextual-orchestrator auto by default

- Status: Accepted
- Date: 2026-08-16

## Context

The DiagramWeave adapter called the contextual-orchestrator endpoint without an
explicit policy. Although the gateway's current omission default is \\`auto\\`, an
implicit default is not reviewable at the consumer boundary and can silently change
when compatibility behavior evolves. DiagramWeave must not choose a provider or force
one worker for all proposal requests.

## Decision

Every production edit-proposal request includes
\\`orchestration_mode: "auto"\\`. Contextual-orchestrator owns the bounded
route/verify/conduct decision, provider/model selection, failover, and known-cost
tie-breaks. DiagramWeave retains source authority, revision hashes, the no-tools
boundary, strict JSON parsing, Core validation, requested/effective scope checks, and
explicit application of accepted edits.

Explicit route or conduct selection is reserved for controlled experiments and
operator rollback; it is not exposed as the ordinary product default.

## Consequences

Simple edits may still use a single worker when that is the quality-sufficient
least-cost plan. Ambiguous, high-risk, or complex edits can receive independent
verification or deeper orchestration without altering the adapter's public API.

## References

Omidvar, H., & Akhlaghi, V. (2026). *A communication-theoretic framework for LLM agents: Cost-aware adaptive reliability* [Preprint]. arXiv. https://doi.org/10.48550/arXiv.2605.09121

Tang, Y., Cetin, E., Xu, J., Sun, Q., Nielsen, S., Richard, V., Goda, H., Tymchenko, I., Nguyen, N., Lee, H., Ashiga, M., Kotyan, S., Kuroki, S., & Clanuwat, T. (2026). *Sakana Fugu technical report* [Technical report]. arXiv. https://doi.org/10.48550/arXiv.2606.21228
`,
    'utf8',
  );
}

let changelog = readFileSync(changelogPath, 'utf8');
const entry =
  '- Contextual Orchestrator edit-proposal requests now explicitly select `auto`, delegating route, verification, conducted workflow, provider choice, and known-cost optimization to the central orchestration policy.\n';
if (!changelog.includes(entry)) {
  const marker = '### Changed\n\n';
  const matches = changelog.split(marker).length - 1;
  if (matches !== 1) {
    throw new Error(`expected one Unreleased Changed marker, found ${matches}`);
  }
  changelog = changelog.replace(marker, `${marker}${entry}`);
  writeFileSync(changelogPath, changelog, 'utf8');
}
