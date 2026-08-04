import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizePlantUmlDiagnostics } from '../src/standard-report.js';

function arrayWithLength(value) {
  return new Proxy([], {
    get(target, property, receiver) {
      return property === 'length'
        ? value
        : Reflect.get(target, property, receiver);
    },
  });
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
