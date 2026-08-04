import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';

import { hashSource } from '../../core/src/index.js';
import {
  PlantUmlRendererError,
  createPlantUmlRenderer,
} from '../src/index.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\bin\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const source = '@startuml\nAlice -> Bob: hello\n@enduml\n';
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngEnd = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const validPng = Buffer.concat([pngSignature, Buffer.from('payload'), pngEnd]);
const validSvg = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>');

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.stdinBytes = [];
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        this.stdinBytes.push(Buffer.from(chunk));
        callback();
      },
    });
    this.killCalls = [];
  }

  kill(signal) {
    this.killCalls.push(signal);
    return true;
  }

  input() {
    return Buffer.concat(this.stdinBytes);
  }
}

function successfulSpawn(output = validSvg) {
  let child;
  const calls = [];
  const spawnImpl = (command, args, options) => {
    child = new FakeChild();
    calls.push({ command, args, options, child });
    queueMicrotask(() => {
      child.stdout.end(output);
      child.stderr.end();
      child.emit('close', 0, null);
    });
    return child;
  };
  return {
    spawnImpl,
    calls,
    child: () => child,
  };
}

function rendererOptions(overrides = {}) {
  return {
    javaPath,
    jarPath,
    timeoutMs: 1000,
    maxSourceBytes: 1024,
    maxOutputBytes: 4096,
    maxDiagnosticBytes: 1024,
    ...overrides,
  };
}

function assertRendererError(error, code, field = undefined) {
  assert.equal(error instanceof PlantUmlRendererError, true);
  assert.equal(error.code, code);
  assert.equal(error.field, field);
  return true;
}

test('renderer emits a sandboxed stdin-only SVG command and immutable artifact', async () => {
  const fake = successfulSpawn(validSvg);
  const renderer = createPlantUmlRenderer(rendererOptions({ spawnImpl: fake.spawnImpl }));

  const artifact = await renderer.render({ source, format: 'svg' });
  const call = fake.calls[0];

  assert.equal(call.command, javaPath);
  assert.deepEqual(call.args, [
    '-DPLANTUML_SECURITY_PROFILE=SANDBOX',
    '-jar',
    jarPath,
    '-charset',
    'UTF-8',
    '-nometadata',
    '-stdrpt:1',
    '-tsvg',
    '-pipe',
  ]);
  assert.deepEqual(call.options, {
    cwd: process.platform === 'win32' ? 'C:\\PlantUML' : '/opt/plantuml',
    env: {},
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  assert.equal(fake.child().input().toString('utf8'), source);
  assert.deepEqual(artifact, {
    format: 'svg',
    mediaType: 'image/svg+xml',
    encoding: 'base64',
    dataBase64: validSvg.toString('base64'),
    byteLength: validSvg.byteLength,
    sourceRevisionHash: hashSource(source),
  });
  assert.equal(Object.isFrozen(artifact), true);
  assert.equal(Object.isFrozen(renderer), true);
});

test('renderer emits PNG mode and defaults the request format to SVG', async () => {
  const pngFake = successfulSpawn(validPng);
  const pngRenderer = createPlantUmlRenderer(rendererOptions({ spawnImpl: pngFake.spawnImpl }));
  const pngArtifact = await pngRenderer.render({ source, format: 'png' });

  assert.equal(pngFake.calls[0].args.includes('-tpng'), true);
  assert.equal(pngArtifact.mediaType, 'image/png');
  assert.equal(pngArtifact.dataBase64, validPng.toString('base64'));

  const svgFake = successfulSpawn(validSvg);
  const svgRenderer = createPlantUmlRenderer(rendererOptions({ spawnImpl: svgFake.spawnImpl }));
  assert.equal((await svgRenderer.render({ source })).format, 'svg');
});

test('renderer uses documented safe defaults when optional limits are omitted', async () => {
  const fake = successfulSpawn(validSvg);
  const renderer = createPlantUmlRenderer({ javaPath, jarPath, spawnImpl: fake.spawnImpl });

  const artifact = await renderer.render({ source });
  assert.equal(artifact.format, 'svg');
});

const invalidOptions = [
  ['options must be a plain object', null, 'options'],
  ['javaPath must be a string', { javaPath: 42, jarPath }, 'javaPath'],
  ['javaPath must be nonempty', { javaPath: '   ', jarPath }, 'javaPath'],
  ['javaPath must be absolute', { javaPath: 'java', jarPath }, 'javaPath'],
  ['javaPath cannot contain controls', { javaPath: `${javaPath}\n`, jarPath }, 'javaPath'],
  ['javaPath is bounded', { javaPath: `${javaPath}${'x'.repeat(4097)}`, jarPath }, 'javaPath'],
  ['jarPath must be a string', { javaPath, jarPath: 42 }, 'jarPath'],
  ['jarPath must be nonempty', { javaPath, jarPath: '  ' }, 'jarPath'],
  ['jarPath must be absolute', { javaPath, jarPath: 'plantuml.jar' }, 'jarPath'],
  ['jarPath cannot contain controls', { javaPath, jarPath: `${jarPath}\0` }, 'jarPath'],
  ['jarPath is bounded', { javaPath, jarPath: `${jarPath}${'x'.repeat(4097)}` }, 'jarPath'],
  ['timeout must be an integer', { javaPath, jarPath, timeoutMs: 1.5 }, 'timeoutMs'],
  ['timeout has a minimum', { javaPath, jarPath, timeoutMs: 9 }, 'timeoutMs'],
  ['timeout has a maximum', { javaPath, jarPath, timeoutMs: 120001 }, 'timeoutMs'],
  ['source limit must be an integer', { javaPath, jarPath, maxSourceBytes: 1.5 }, 'maxSourceBytes'],
  ['source limit has a minimum', { javaPath, jarPath, maxSourceBytes: 0 }, 'maxSourceBytes'],
  ['source limit has a maximum', { javaPath, jarPath, maxSourceBytes: 16777217 }, 'maxSourceBytes'],
  ['output limit must be an integer', { javaPath, jarPath, maxOutputBytes: 1.5 }, 'maxOutputBytes'],
  ['output limit has a minimum', { javaPath, jarPath, maxOutputBytes: 0 }, 'maxOutputBytes'],
  ['output limit has a maximum', { javaPath, jarPath, maxOutputBytes: 67108865 }, 'maxOutputBytes'],
  ['diagnostic limit must be an integer', { javaPath, jarPath, maxDiagnosticBytes: 1.5 }, 'maxDiagnosticBytes'],
  ['diagnostic limit has a minimum', { javaPath, jarPath, maxDiagnosticBytes: 0 }, 'maxDiagnosticBytes'],
  ['diagnostic limit has a maximum', { javaPath, jarPath, maxDiagnosticBytes: 1048577 }, 'maxDiagnosticBytes'],
  ['spawn implementation is callable', { javaPath, jarPath, spawnImpl: 42 }, 'spawnImpl'],
];

for (const [name, options, field] of invalidOptions) {
  test(`createPlantUmlRenderer rejects when ${name}`, () => {
    assert.throws(
      () => createPlantUmlRenderer(options),
      (error) => assertRendererError(error, 'invalid_renderer_options', field),
    );
  });
}

test('renderer accepts null-prototype option and request records', async () => {
  const fake = successfulSpawn(validSvg);
  const options = Object.assign(Object.create(null), rendererOptions({ spawnImpl: fake.spawnImpl }));
  const request = Object.assign(Object.create(null), { source, format: 'svg' });
  const renderer = createPlantUmlRenderer(options);

  assert.equal((await renderer.render(request)).format, 'svg');
});

const invalidRequests = [
  ['request must be a plain object', null, 'request'],
  ['source must be a string', { source: 42 }, 'source'],
  ['source cannot contain NUL', { source: `${source}\0` }, 'source'],
  ['format is supported', { source, format: 'pdf' }, 'format'],
];

for (const [name, request, field] of invalidRequests) {
  test(`renderer rejects when ${name}`, async () => {
    const fake = successfulSpawn(validSvg);
    const renderer = createPlantUmlRenderer(rendererOptions({ spawnImpl: fake.spawnImpl }));
    await assert.rejects(
      renderer.render(request),
      (error) => assertRendererError(error, 'invalid_render_request', field),
    );
    assert.equal(fake.calls.length, 0);
  });
}

test('renderer rejects source that exceeds the configured UTF-8 byte limit', async () => {
  const fake = successfulSpawn(validSvg);
  const renderer = createPlantUmlRenderer(
    rendererOptions({ maxSourceBytes: 3, spawnImpl: fake.spawnImpl }),
  );

  await assert.rejects(
    renderer.render({ source: 'éé', format: 'svg' }),
    (error) => assertRendererError(error, 'invalid_render_request', 'source'),
  );
});

test('renderer converts synchronous spawn failures into a safe availability error', async () => {
  const renderer = createPlantUmlRenderer(
    rendererOptions({
      spawnImpl: () => {
        throw new Error(`leaked ${source}`);
      },
    }),
  );

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_unavailable');
      assert.doesNotMatch(error.message, /Alice|leaked/);
      return true;
    },
  );
});

test('renderer converts child error events into a safe availability error', async () => {
  const spawnImpl = () => {
    const child = new FakeChild();
    queueMicrotask(() => child.emit('error', new Error(`leaked ${source}`)));
    return child;
  };
  const renderer = createPlantUmlRenderer(rendererOptions({ spawnImpl }));

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_unavailable');
      assert.doesNotMatch(error.message, /Alice|leaked/);
      return true;
    },
  );
});

test('renderer times out, kills the child, and never exposes source', async () => {
  let child;
  const spawnImpl = () => {
    child = new FakeChild();
    return child;
  };
  const renderer = createPlantUmlRenderer(
    rendererOptions({ timeoutMs: 10, spawnImpl }),
  );

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_timeout');
      assert.doesNotMatch(error.message, /Alice/);
      return true;
    },
  );
  assert.deepEqual(child.killCalls, ['SIGKILL']);
});

test('renderer rejects oversized stdout and records the stream without leaking data', async () => {
  let child;
  const spawnImpl = () => {
    child = new FakeChild();
    queueMicrotask(() => child.stdout.write(Buffer.alloc(17, 0x41)));
    return child;
  };
  const renderer = createPlantUmlRenderer(
    rendererOptions({ maxOutputBytes: 16, spawnImpl }),
  );

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_output_too_large');
      assert.equal(error.stream, 'stdout');
      assert.doesNotMatch(error.message, /AAAA/);
      return true;
    },
  );
  assert.deepEqual(child.killCalls, ['SIGKILL']);
});

test('renderer rejects oversized stderr and records the diagnostic stream', async () => {
  let child;
  const spawnImpl = () => {
    child = new FakeChild();
    queueMicrotask(() => child.stderr.write(Buffer.alloc(17, 0x42)));
    return child;
  };
  const renderer = createPlantUmlRenderer(
    rendererOptions({ maxDiagnosticBytes: 16, spawnImpl }),
  );

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_output_too_large');
      assert.equal(error.stream, 'stderr');
      return true;
    },
  );
  assert.deepEqual(child.killCalls, ['SIGKILL']);
});

test('renderer rejects a nonzero exit without exposing stderr', async () => {
  const spawnImpl = () => {
    const child = new FakeChild();
    queueMicrotask(() => {
      child.stderr.end(`status=ERROR\nlabel=${source}`);
      child.emit('close', 2, null);
    });
    return child;
  };
  const renderer = createPlantUmlRenderer(rendererOptions({ spawnImpl }));

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_failed');
      assert.equal(error.exitCode, 2);
      assert.equal(error.signal, undefined);
      assert.doesNotMatch(error.message, /Alice|status=ERROR/);
      return true;
    },
  );
});

test('renderer rejects a signaled exit with a stable safe error', async () => {
  const spawnImpl = () => {
    const child = new FakeChild();
    queueMicrotask(() => child.emit('close', null, 'SIGTERM'));
    return child;
  };
  const renderer = createPlantUmlRenderer(rendererOptions({ spawnImpl }));

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_failed');
      assert.equal(error.exitCode, undefined);
      assert.equal(error.signal, 'SIGTERM');
      return true;
    },
  );
});

test('renderer rejects invalid SVG, truncated PNG, and concatenated PNG output', async () => {
  for (const [format, output] of [
    ['svg', Buffer.from('<html></html>')],
    ['png', Buffer.concat([pngSignature, Buffer.from('truncated')])],
    ['png', Buffer.concat([validPng, validPng])],
  ]) {
    const fake = successfulSpawn(output);
    const renderer = createPlantUmlRenderer(rendererOptions({ spawnImpl: fake.spawnImpl }));
    await assert.rejects(
      renderer.render({ source, format }),
      (error) => assertRendererError(error, 'renderer_output_invalid'),
    );
  }
});

test('renderer ignores late child events after a terminal failure', async () => {
  let child;
  const spawnImpl = () => {
    child = new FakeChild();
    queueMicrotask(() => {
      child.stdout.write(Buffer.alloc(17));
      child.emit('error', new Error('late'));
      child.emit('close', 0, null);
    });
    return child;
  };
  const renderer = createPlantUmlRenderer(
    rendererOptions({ maxOutputBytes: 16, spawnImpl }),
  );

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => error.code === 'renderer_output_too_large',
  );
  assert.deepEqual(child.killCalls, ['SIGKILL']);
});

test('renderer rejects invalid UTF-8 SVG output', async () => {
  const fake = successfulSpawn(Buffer.from([0xff, 0xfe, 0xfd]));
  const renderer = createPlantUmlRenderer(rendererOptions({ spawnImpl: fake.spawnImpl }));

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => assertRendererError(error, 'renderer_output_invalid'),
  );
});

test('renderer rejects every incomplete process handle shape', async () => {
  const valid = new FakeChild();
  const invalidChildren = [
    null,
    42,
    { stdout: valid.stdout, stderr: valid.stderr, once: valid.once, kill: valid.kill },
    { stdin: {}, stdout: valid.stdout, stderr: valid.stderr, once: valid.once, kill: valid.kill },
    {
      stdin: { on() {} },
      stdout: valid.stdout,
      stderr: valid.stderr,
      once: valid.once,
      kill: valid.kill,
    },
    {
      stdin: valid.stdin,
      stderr: valid.stderr,
      once: valid.once,
      kill: valid.kill,
    },
    {
      stdin: valid.stdin,
      stdout: {},
      stderr: valid.stderr,
      once: valid.once,
      kill: valid.kill,
    },
    {
      stdin: valid.stdin,
      stdout: valid.stdout,
      once: valid.once,
      kill: valid.kill,
    },
    {
      stdin: valid.stdin,
      stdout: valid.stdout,
      stderr: {},
      once: valid.once,
      kill: valid.kill,
    },
    {
      stdin: valid.stdin,
      stdout: valid.stdout,
      stderr: valid.stderr,
      kill: valid.kill,
    },
    {
      stdin: valid.stdin,
      stdout: valid.stdout,
      stderr: valid.stderr,
      once() {},
    },
  ];

  for (const child of invalidChildren) {
    const renderer = createPlantUmlRenderer(
      rendererOptions({ spawnImpl: () => child }),
    );
    await assert.rejects(
      renderer.render({ source, format: 'svg' }),
      (error) => assertRendererError(error, 'renderer_unavailable'),
    );
  }
});

test('renderer preserves the original bounded error when process termination races', async () => {
  const spawnImpl = () => {
    const child = new FakeChild();
    child.kill = () => {
      throw new Error('already gone');
    };
    queueMicrotask(() => child.stdout.write(Buffer.alloc(17)));
    return child;
  };
  const renderer = createPlantUmlRenderer(
    rendererOptions({ maxOutputBytes: 16, spawnImpl }),
  );

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => assertRendererError(error, 'renderer_output_too_large'),
  );
});

test('renderer ignores late stdout and stderr chunks after a terminal failure', async () => {
  const spawnImpl = () => {
    const child = new FakeChild();
    queueMicrotask(() => {
      child.stdout.write(Buffer.alloc(17));
      child.stdout.write(Buffer.from('late stdout'));
      child.stderr.write(Buffer.from('late stderr'));
    });
    return child;
  };
  const renderer = createPlantUmlRenderer(
    rendererOptions({ maxOutputBytes: 16, spawnImpl }),
  );

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => error.code === 'renderer_output_too_large',
  );
});

test('renderer accepts bounded diagnostic output without exposing it', async () => {
  const spawnImpl = () => {
    const child = new FakeChild();
    queueMicrotask(() => {
      child.stderr.write(Buffer.from('protocolVersion=1\nstatus=OK\n'));
      child.stdout.end(validSvg);
      child.emit('close', 0, null);
    });
    return child;
  };
  const renderer = createPlantUmlRenderer(rendererOptions({ spawnImpl }));

  assert.equal((await renderer.render({ source, format: 'svg' })).format, 'svg');
});

test('renderer converts stdin error events into a safe availability error', async () => {
  const spawnImpl = () => {
    const child = new FakeChild();
    queueMicrotask(() => child.stdin.emit('error', new Error(`leaked ${source}`)));
    return child;
  };
  const renderer = createPlantUmlRenderer(rendererOptions({ spawnImpl }));

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_unavailable');
      assert.doesNotMatch(error.message, /Alice|leaked/);
      return true;
    },
  );
});

test('renderer converts synchronous stdin write failures into a safe availability error', async () => {
  const spawnImpl = () => {
    const child = new FakeChild();
    child.stdin = {
      on() {},
      end() {
        throw new Error(`leaked ${source}`);
      },
    };
    return child;
  };
  const renderer = createPlantUmlRenderer(rendererOptions({ spawnImpl }));

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_unavailable');
      assert.doesNotMatch(error.message, /Alice|leaked/);
      return true;
    },
  );
});

test('renderer construction uses the built-in spawn implementation by default', () => {
  const renderer = createPlantUmlRenderer({ javaPath, jarPath });
  assert.equal(Object.isFrozen(renderer), true);
});
