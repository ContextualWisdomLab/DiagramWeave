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

const governingAdrs = [
  '0001-source-authority.md',
  '0002-model-proposals.md',
  '0003-renderer-isolation.md',
  '0004-authoritative-symbol-tree.md',
  '0005-transport-neutral-lsp.md',
  '0006-provider-neutral-orchestrator.md',
  '0007-automation-authority.md',
];

const readDocument = (path) => readFileSync(path, 'utf8');

const assertTraceabilityMaturity = (traceability, label, maturity) => {
  const row = traceability
    .split('\n')
    .find((line) => line.startsWith('|') && line.includes(`| ${label} |`));
  assert.ok(row, `missing traceability row: ${label}`);
  assert.ok(
    row.trimEnd().endsWith(`| ${maturity} |`),
    `${label} must remain ${maturity}: ${row}`,
  );
};

test('canonical product and architecture documents remain discoverable', () => {
  const missing = requiredDocuments.filter((path) => !existsSync(path));
  assert.deepEqual(missing, []);
});

test('documentation map links every canonical contract', () => {
  const documentation = readDocument('DOCUMENTATION.md');
  for (const path of requiredDocuments.slice(1)) {
    assert.ok(
      documentation.includes(`](${path})`),
      `documentation map does not link ${path}`,
    );
  }
});

test('conceptual ERD does not invent foundation persistence', () => {
  const erd = readDocument('docs/ERD.md');
  assert.match(erd, /Protected main has no DiagramWeave-owned database/);
  assert.match(erd, /do not own:/);
  assert.match(erd, /future physical ERD/);
});

test('active and future work is not promoted to protected-main claims', () => {
  const documentation = readDocument('DOCUMENTATION.md');
  const traceability = readDocument('docs/TRACEABILITY.md');
  assert.match(
    documentation,
    /Open PR #22 references and PR #24 hourly-governance remediation remain active-PR/,
  );
  assertTraceabilityMaturity(traceability, 'same-document references', 'active-PR');
  assertTraceabilityMaturity(
    traceability,
    'work-conserving hourly remediation',
    'active-PR',
  );
  assertTraceabilityMaturity(traceability, 'Studio visual editor', 'future-host');
});

test('ADR index links every governing decision', () => {
  const index = readDocument('docs/adr/README.md');
  for (const adr of governingAdrs) {
    assert.ok(index.includes(`](${adr})`), `ADR index does not link ${adr}`);
  }
});
