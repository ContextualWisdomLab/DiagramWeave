#!/usr/bin/env node
/** Stage the client regression for explicit adaptive orchestration. */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testPath = resolve(
  root,
  'packages/contextual-orchestrator/test/client.test.js',
);
let source = readFileSync(testPath, 'utf8');
const assertion = "  assert.equal(body.orchestration_mode, 'auto');\n";
if (!source.includes(assertion)) {
  const anchor = "  assert.equal(body.model, 'contextual-orchestrator');\n";
  const matches = source.split(anchor).length - 1;
  if (matches < 1) {
    throw new Error('request model assertion anchor was not found');
  }
  source = source.replace(anchor, `${anchor}${assertion}`);
  writeFileSync(testPath, source, 'utf8');
}
