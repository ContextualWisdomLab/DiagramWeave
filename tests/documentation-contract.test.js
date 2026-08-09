import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const requiredDocuments = [
  'DOCUMENTATION.md',
  'docs/product/diagramweave-prd.md',
  'docs/TRD.md',
  'docs/architecture.md',
  'docs/UML.md',
  'docs/ERD.md',
  'docs/security-model.md',
  'docs/THREAT_MODEL.md',
  'docs/TEST_STRATEGY.md',
  'docs/OPERABILITY.md',
  'docs/TRACEABILITY.md',
  'docs/adr/README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'CHANGELOG.md',
];

const readDocument = (path) => readFileSync(path, 'utf8');

test('canonical product and architecture documents remain discoverable', () => {
  const missing = requiredDocuments.filter((path) => !existsSync(path));
  assert.deepEqual(missing, []);
});

test('documentation map links the cross-cutting contracts', () => {
  const documentation = readDocument('DOCUMENTATION.md');
  for (const path of requiredDocuments.slice(1, 12)) {
    assert.match(documentation, new RegExp(path.replaceAll('.', '\\.')));
  }
});

test('conceptual ERD does not invent foundation persistence', () => {
  const erd = readDocument('docs/ERD.md');
  assert.match(erd, /Protected main has no DiagramWeave-owned database/);
  assert.match(erd, /do not own:/);
  assert.match(erd, /future physical ERD/);
});

test('active pull requests are not promoted to protected-main claims', () => {
  const documentation = readDocument('DOCUMENTATION.md');
  const traceability = readDocument('docs/TRACEABILITY.md');
  assert.match(documentation, /Open PR #22 references and PR #24 hourly-governance remediation remain active-PR/);
  assert.match(traceability, /same-document references[\s\S]*active-PR/);
  assert.match(traceability, /work-conserving hourly remediation[\s\S]*active-PR/);
});

test('ADR index contains every governing decision', () => {
  const index = readDocument('docs/adr/README.md');
  for (const adr of [
    '0001-source-authority.md',
    '0002-model-proposals.md',
    '0003-renderer-isolation.md',
    '0004-authoritative-symbol-tree.md',
    '0005-transport-neutral-lsp.md',
    '0006-provider-neutral-orchestrator.md',
    '0007-automation-authority.md',
  ]) {
    assert.match(index, new RegExp(adr.replaceAll('.', '\\.')));
  }
});
