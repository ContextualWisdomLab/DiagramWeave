import assert from 'node:assert/strict';
import test from 'node:test';

import { PlantUmlRendererError } from '@contextualwisdomlab/diagramweave-plantuml-renderer';

import { diagnosticsForRendererOutcome } from '../src/diagnostics.js';

function syntaxDiagnostic(line) {
  const point = { line, character: 0 };
  return {
    range: { start: point, end: point },
    severity: 1,
    code: 'plantuml.syntax',
    source: 'plantuml',
    message: 'PlantUML reported a syntax error.',
    data: { plantUmlLineNumber: line + 1 },
  };
}

test('returns the shared empty collection for successful validation', () => {
  const first = diagnosticsForRendererOutcome(null);
  const second = diagnosticsForRendererOutcome(null);
  assert.equal(first, second);
  assert.deepEqual(first, []);
  assert.equal(Object.isFrozen(first), true);
});

test('clones renderer-owned syntax diagnostics and rejects caller mutation', () => {
  const candidate = syntaxDiagnostic(3);
  const error = new PlantUmlRendererError('renderer_failed', 'safe', {
    diagnostics: [candidate],
  });
  const diagnostics = diagnosticsForRendererOutcome(error);
  candidate.range.start.line = 99;
  assert.equal(diagnostics[0].range.start.line, 3);
  assert.equal(Object.isFrozen(diagnostics), true);
  assert.equal(Object.isFrozen(diagnostics[0]), true);
});

test('collapses locationless and unknown failures to one fixed operational diagnostic', () => {
  const rendererFailure = diagnosticsForRendererOutcome(
    new PlantUmlRendererError('renderer_timeout', 'safe'),
  );
  const unknownFailure = diagnosticsForRendererOutcome(new Error('secret source'));
  assert.equal(rendererFailure, unknownFailure);
  assert.deepEqual(rendererFailure, [{
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
    severity: 1,
    code: 'diagramweave.renderer',
    source: 'diagramweave',
    message: 'DiagramWeave could not validate this document.',
  }]);
  assert.equal(JSON.stringify(rendererFailure).includes('secret source'), false);
});
