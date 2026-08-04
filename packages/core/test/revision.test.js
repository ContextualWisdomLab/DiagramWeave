import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InvalidSourceError,
  hashSource,
} from '../src/index.js';

test('hashSource returns the deterministic lowercase SHA-256 revision', () => {
  assert.equal(
    hashSource('@startuml\nAlice -> Bob\n@enduml\n'),
    'a13a898d714ca777db4fd88e09d32e7d3d66cd34db7756fad31752c3cc8db0b8',
  );
  assert.equal(hashSource(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('hashSource rejects non-string source with a stable error code', () => {
  assert.throws(
    () => hashSource(new Uint8Array()),
    (error) => {
      assert.equal(error instanceof InvalidSourceError, true);
      assert.equal(error.code, 'invalid_source');
      assert.equal(error.message, 'Diagram source must be a string.');
      return true;
    },
  );
});
