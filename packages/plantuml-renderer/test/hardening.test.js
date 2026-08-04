import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';

import {
  PlantUmlRendererError,
  createPlantUmlRenderer,
  plantUmlRendererLimits,
} from '../src/index.js';

const javaPath = process.platform === 'win32'
  ? 'C:\\Java\\bin\\java.exe'
  : '/opt/java/bin/java';
const jarPath = process.platform === 'win32'
  ? 'C:\\PlantUML\\plantuml.jar'
  : '/opt/plantuml/plantuml.jar';
const source = '@startuml\nAlice -> Bob: hello\n@enduml\n';

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.stdin = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });
    this.killCalls = [];
  }

  kill(signal) {
    this.killCalls.push(signal);
    return true;
  }
}

function rendererOptions(spawnImpl, overrides = {}) {
  return {
    javaPath,
    jarPath,
    timeoutMs: 1000,
    maxSourceBytes: 1024,
    maxOutputBytes: 65536,
    maxDiagnosticBytes: 1024,
    spawnImpl,
    ...overrides,
  };
}

function spawnOutput(output) {
  let child;
  return {
    spawnImpl() {
      child = new FakeChild();
      queueMicrotask(() => {
        child.stdout.end(Buffer.from(output));
        child.stderr.end();
        child.emit('close', 0, null);
      });
      return child;
    },
    child() {
      return child;
    },
  };
}

function assertRendererError(error, code, field = undefined) {
  assert.equal(error instanceof PlantUmlRendererError, true);
  assert.equal(error.code, code);
  assert.equal(error.field, field);
  return true;
}

function assertNoSourceLeak(error) {
  const pending = [error];
  const inspected = new Set();
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value === 'string') {
      assert.doesNotMatch(value, /Alice|leaked/);
      continue;
    }
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
      continue;
    }
    if (inspected.has(value)) {
      continue;
    }
    inspected.add(value);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if ('value' in descriptor) {
        pending.push(descriptor.value);
      }
    }
  }
}

test('publishes one deeply frozen authoritative renderer-limit contract', () => {
  assert.deepEqual(plantUmlRendererLimits, {
    timeoutMs: { default: 15000, minimum: 10, maximum: 120000 },
    maxSourceBytes: { default: 1048576, minimum: 1, maximum: 16777216 },
    maxOutputBytes: { default: 16777216, minimum: 1, maximum: 67108864 },
    maxDiagnosticBytes: { default: 65536, minimum: 1, maximum: 1048576 },
  });
  assert.equal(Object.isFrozen(plantUmlRendererLimits), true);
  for (const limit of Object.values(plantUmlRendererLimits)) {
    assert.equal(Object.isFrozen(limit), true);
  }
});

test('accepts every documented inclusive renderer-limit boundary', () => {
  for (const [field, limit] of Object.entries(plantUmlRendererLimits)) {
    for (const value of [limit.minimum, limit.maximum]) {
      const renderer = createPlantUmlRenderer({
        javaPath,
        jarPath,
        [field]: value,
      });
      assert.equal(Object.isFrozen(renderer), true);
    }
  }
});

test('enforces documented default source and output bounds', async () => {
  const normal = spawnOutput('<svg/>');
  const renderer = createPlantUmlRenderer({
    javaPath,
    jarPath,
    spawnImpl: normal.spawnImpl,
  });
  await assert.rejects(
    renderer.render({
      source: 'a'.repeat(plantUmlRendererLimits.maxSourceBytes.default + 1),
    }),
    (error) => assertRendererError(error, 'invalid_render_request', 'source'),
  );

  const oversized = spawnOutput(
    Buffer.alloc(plantUmlRendererLimits.maxOutputBytes.default + 1),
  );
  const outputBoundedRenderer = createPlantUmlRenderer({
    javaPath,
    jarPath,
    spawnImpl: oversized.spawnImpl,
  });
  await assert.rejects(
    outputBoundedRenderer.render({ source }),
    (error) => assertRendererError(error, 'renderer_output_too_large'),
  );
  assert.deepEqual(oversized.child().killCalls, ['SIGKILL']);
});

test('accepts nested SVG roots and supported markup in one document', async () => {
  const accepted = [
    '<svg/>',
    ' \t\r\n<SVG xmlns="http://www.w3.org/2000/svg" /> \n',
    '<?xml version="1.0"?><svg><!-- comment --><![CDATA[<svg></svg>]]><?instruction value?><g data-value=">">text</g><svg /></svg>',
    '<!-- generated --><svg/>',
    '<?plantuml 1.2026.7?><svg/>',
    '<!DOCTYPE svg><svg/>',
    '<!DOCTYPE svg [<!ELEMENT svg ANY><!ENTITY label "a>b">]><svg/>',
    '<!DOCTYPE svg SYSTEM "urn:diagram:weave"><svg/>',
    '<?xml version="1.0"?><!-- generated --><?plantuml 1.2026.7?><!DOCTYPE svg><svg/>',
    '<svg><svg/><svg></svg></svg>',
  ];
  for (const output of accepted) {
    const fake = spawnOutput(output);
    const renderer = createPlantUmlRenderer(rendererOptions(fake.spawnImpl));
    assert.equal((await renderer.render({ source })).format, 'svg');
  }
});

test('rejects malformed SVG boundaries and multiple root documents', async () => {
  const rejected = [
    '',
    ' \t\r\n',
    'plain text',
    '<>',
    '<svg',
    '<?xml version="1.0"<svg></svg>',
    '<!-- generated --><?xml version="1.0"?><svg/>',
    '<?xml version="1.0"?><?xml version="1.0"?><svg/>',
    '<!DOCTYPE svg><!DOCTYPE svg><svg/>',
    '<!DOCTYPE html><svg/>',
    '<!DOCTYPE svg [<!ELEMENT svg ANY><svg/>',
    '<!DOCTYPE svg ]><svg/>',
    '<!-- generated -->',
    '<!ENTITY svg "external"><svg/>',
    '<!-- unterminated<svg></svg>',
    '<![CDATA[unterminated<svg></svg>',
    '<?instruction<svg></svg>',
    '<html></html>',
    '<svg><g',
    '<svg><!-- unterminated</svg>',
    '<svg><![CDATA[unterminated</svg>',
    '<svg><?instruction</svg>',
    '<svg><g></g>',
    '<svg><svg/>',
    '<svg></svg>trailing',
    '<svg/><svg/>',
    '<svg/   >',
    '</svg>',
  ];
  for (const output of rejected) {
    const fake = spawnOutput(output);
    const renderer = createPlantUmlRenderer(rendererOptions(fake.spawnImpl));
    await assert.rejects(
      renderer.render({ source }),
      (error) => assertRendererError(error, 'renderer_output_invalid'),
      output,
    );
  }
});

test('keeps the entire public error surface source-free', async () => {
  const renderer = createPlantUmlRenderer(rendererOptions(() => {
    throw new Error(`leaked ${source}`);
  }));
  await assert.rejects(
    renderer.render({ source }),
    (error) => {
      assertRendererError(error, 'renderer_unavailable');
      assertNoSourceLeak(error);
      return true;
    },
  );
});

test('invalid process-handle fixtures keep valid methods bound to their receiver', async () => {
  const valid = new FakeChild();
  const validOnce = valid.once.bind(valid);
  const validKill = valid.kill.bind(valid);
  const invalid = {
    stdin: valid.stdin,
    stdout: valid.stdout,
    stderr: valid.stderr,
    once: validOnce,
    kill: validKill,
  };
  delete invalid.stdout;
  const renderer = createPlantUmlRenderer(rendererOptions(() => invalid));
  await assert.rejects(
    renderer.render({ source }),
    (error) => assertRendererError(error, 'renderer_unavailable'),
  );
});
