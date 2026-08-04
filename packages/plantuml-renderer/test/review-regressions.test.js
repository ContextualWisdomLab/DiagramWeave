import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';

import {
  PlantUmlRendererError,
  createPlantUmlRenderer,
} from '../src/index.js';

const javaPath = process.platform === 'win32'
  ? 'C:\\Java\\bin\\java.exe'
  : '/opt/java/bin/java';
const jarPath = process.platform === 'win32'
  ? 'C:\\PlantUML\\plantuml.jar'
  : '/opt/plantuml/plantuml.jar';
const source = '@startuml\nAlice -> Bob: hello\n@enduml\n';
const validSvg = Buffer.from(
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
);
const syntaxDiagnostic = Object.freeze({
  range: Object.freeze({
    start: Object.freeze({ line: 1, character: 0 }),
    end: Object.freeze({ line: 1, character: 0 }),
  }),
  severity: 1,
  code: 'plantuml.syntax',
  source: 'plantuml',
  message: 'PlantUML reported a syntax error.',
  data: Object.freeze({ plantUmlLineNumber: 2 }),
});

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
}

function rendererOptions(spawnImpl) {
  return {
    javaPath,
    jarPath,
    timeoutMs: 1000,
    maxSourceBytes: 1024,
    maxOutputBytes: 4096,
    maxDiagnosticBytes: 1024,
    spawnImpl,
  };
}

function assertRendererError(error, code) {
  assert.equal(error instanceof PlantUmlRendererError, true);
  assert.equal(error.code, code);
  return true;
}

test('accepts OK standard reports without matching embedded ERROR text', async () => {
  const renderer = createPlantUmlRenderer(rendererOptions(() => {
    const child = new FakeChild();
    queueMicrotask(() => {
      child.stderr.end(Buffer.from(
        'protocolVersion=1\r\nstatus=OK\r\n' +
        'label=previous status=ERROR text\r\n',
      ));
      child.stdout.end(validSvg);
      child.emit('close', 0, null);
    });
    return child;
  }));

  assert.equal((await renderer.render({ source, format: 'svg' })).format, 'svg');
});

test('rejects ERROR reports with a frozen source-free line diagnostic', async () => {
  const renderer = createPlantUmlRenderer(rendererOptions(() => {
    const child = new FakeChild();
    queueMicrotask(() => {
      child.stderr.end(Buffer.from(
        'protocolVersion=1\nstatus=ERROR\nlineNumber=2\n' +
        'label=Syntax Error?\nError line 2 in file: file1.pu\n',
      ));
      child.stdout.end(validSvg);
      child.emit('close', 0, null);
    });
    return child;
  }));

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_failed');
      assert.equal(error.exitCode, 0);
      assert.deepEqual(error.diagnostics, [syntaxDiagnostic]);
      assert.equal(Object.isFrozen(error.diagnostics), true);
      assert.equal(Object.isFrozen(error.diagnostics[0]), true);
      assert.equal(Object.isFrozen(error.diagnostics[0].range), true);
      assert.equal(Object.isFrozen(error.diagnostics[0].data), true);
      assert.doesNotMatch(
        JSON.stringify(error),
        /Syntax Error|status=ERROR|file1\.pu|Alice/,
      );
      return true;
    },
  );
});

test('does not expose an unknown PlantUML label', async () => {
  const renderer = createPlantUmlRenderer(rendererOptions(() => {
    const child = new FakeChild();
    queueMicrotask(() => {
      child.stderr.end(Buffer.from(
        'status=ERROR\nlineNumber=7\nlabel=CustomerSecretElement leaked\n',
      ));
      child.stdout.end(validSvg);
      child.emit('close', 0, null);
    });
    return child;
  }));

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_failed');
      assert.equal(error.diagnostics[0].range.start.line, 6);
      assert.doesNotMatch(JSON.stringify(error), /CustomerSecretElement|leaked|Alice/);
      return true;
    },
  );
});

test('fails closed without diagnostics when the bounded standard report is invalid', async () => {
  for (const report of [
    Buffer.from([0xff, 0xfe, 0xfd]),
    Buffer.from('protocolVersion=2\nstatus=ERROR\nlineNumber=2\n'),
  ]) {
    const renderer = createPlantUmlRenderer(rendererOptions(() => {
      const child = new FakeChild();
      queueMicrotask(() => {
        child.stderr.end(report);
        child.stdout.end(validSvg);
        child.emit('close', 0, null);
      });
      return child;
    }));

    await assert.rejects(
      renderer.render({ source, format: 'svg' }),
      (error) => {
        assertRendererError(error, 'renderer_failed');
        assert.deepEqual(error.diagnostics, []);
        assert.equal(Object.isFrozen(error.diagnostics), true);
        return true;
      },
    );
  }
});

test('PlantUmlRendererError clones supplied diagnostics', () => {
  const original = [{
    range: {
      start: { line: 1, character: 0 },
      end: { line: 1, character: 0 },
    },
    severity: 1,
    code: 'plantuml.syntax',
    source: 'plantuml',
    message: 'PlantUML reported a syntax error.',
    data: { plantUmlLineNumber: 2 },
  }];
  const error = new PlantUmlRendererError(
    'renderer_failed',
    'PlantUML rejected the source or failed to render it.',
    { diagnostics: original },
  );

  original[0].range.start.line = 99;
  original.push({});

  assert.deepEqual(error.diagnostics, [syntaxDiagnostic]);
  assert.notEqual(error.diagnostics, original);
  assert.notEqual(error.diagnostics[0], original[0]);
});

test('terminates the child when stdin emits an error', async () => {
  let child;
  const renderer = createPlantUmlRenderer(rendererOptions(() => {
    child = new FakeChild();
    queueMicrotask(() => child.stdin.emit('error', new Error(`leaked ${source}`)));
    return child;
  }));

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_unavailable');
      assert.doesNotMatch(error.message, /Alice|leaked/);
      return true;
    },
  );
  assert.deepEqual(child.killCalls, ['SIGKILL']);
});

test('terminates the child when stdin.end throws synchronously', async () => {
  let child;
  const renderer = createPlantUmlRenderer(rendererOptions(() => {
    child = new FakeChild();
    child.stdin = {
      on() {},
      end() {
        throw new Error(`leaked ${source}`);
      },
    };
    return child;
  }));

  await assert.rejects(
    renderer.render({ source, format: 'svg' }),
    (error) => {
      assertRendererError(error, 'renderer_unavailable');
      assert.doesNotMatch(error.message, /Alice|leaked/);
      return true;
    },
  );
  assert.deepEqual(child.killCalls, ['SIGKILL']);
});
