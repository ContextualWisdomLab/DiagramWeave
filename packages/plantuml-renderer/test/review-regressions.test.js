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
  schemaVersion: 1,
  source: 'plantuml',
  severity: 'error',
  code: 'plantuml_syntax_error',
  message: 'PlantUML reported a syntax error.',
  lineNumber: 2,
  columnNumber: null,
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
        'protocolVersion=1\nstatus=ERROR\nlineNumber=2\nlabel=Syntax Error\n',
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
      assert.doesNotMatch(error.message, /Syntax Error|status=ERROR|Alice/);
      return true;
    },
  );
});

test('maps unknown labels to a generic diagnostic without disclosure', async () => {
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
      assert.deepEqual(error.diagnostics, [{
        schemaVersion: 1,
        source: 'plantuml',
        severity: 'error',
        code: 'plantuml_error',
        message: 'PlantUML reported a diagram error.',
        lineNumber: 7,
        columnNumber: null,
      }]);
      assert.doesNotMatch(JSON.stringify(error), /CustomerSecretElement|leaked|Alice/);
      return true;
    },
  );
});

test('fails closed without diagnostics when the standard report is not UTF-8', async () => {
  const renderer = createPlantUmlRenderer(rendererOptions(() => {
    const child = new FakeChild();
    queueMicrotask(() => {
      child.stderr.end(Buffer.from([0xff, 0xfe, 0xfd]));
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
});

test('PlantUmlRendererError clones and freezes supplied diagnostics', () => {
  const originalDiagnostic = { ...syntaxDiagnostic };
  const originalDiagnostics = [originalDiagnostic];
  const error = new PlantUmlRendererError(
    'renderer_failed',
    'PlantUML rejected the source or failed to render it.',
    { diagnostics: originalDiagnostics },
  );

  originalDiagnostic.lineNumber = 99;
  originalDiagnostics.push({ ...syntaxDiagnostic, lineNumber: 100 });

  assert.deepEqual(error.diagnostics, [syntaxDiagnostic]);
  assert.notEqual(error.diagnostics, originalDiagnostics);
  assert.notEqual(error.diagnostics[0], originalDiagnostic);
  assert.equal(Object.isFrozen(error.diagnostics), true);
  assert.equal(Object.isFrozen(error.diagnostics[0]), true);
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
