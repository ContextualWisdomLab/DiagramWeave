import assert from 'node:assert/strict';
import test from 'node:test';

import { plantUmlRendererLimits } from '../src/limits.js';
import {
  parsePlantUmlStandardReport,
  sanitizePlantUmlDiagnostics,
} from '../src/standard-report.js';

function arrayWithLength(value) {
  return new Proxy([], {
    get(target, property, receiver) {
      return property === 'length'
        ? value
        : Reflect.get(target, property, receiver);
    },
  });
}

class MisreportedDiagnosticBytes extends Uint8Array {
  get byteLength() {
    return 1;
  }
}

test('rejects noninteger, negative, and oversized Proxy array lengths', () => {
  for (const length of ['1', -1, 33]) {
    assert.deepEqual(sanitizePlantUmlDiagnostics(arrayWithLength(length)), []);
  }
});

test('rejects a revoked Proxy without propagating its exception', () => {
  const { proxy, revoke } = Proxy.revocable([], {});
  revoke();
  assert.deepEqual(sanitizePlantUmlDiagnostics(proxy), []);
});

test('uses the intrinsic typed-array length instead of an overridden getter', () => {
  const diagnostics = new MisreportedDiagnosticBytes(
    plantUmlRendererLimits.maxDiagnosticBytes.maximum + 1,
  );
  assert.equal(diagnostics.byteLength, 1);
  assert.deepEqual(parsePlantUmlStandardReport(diagnostics), {
    protocolVersion: null,
    status: 'invalid',
    diagnostics: [],
  });
});
