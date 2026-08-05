import assert from 'node:assert/strict';
import test from 'node:test';

import { PlantUmlRendererError } from '@contextualwisdomlab/diagramweave-plantuml-renderer';

import { LanguageServerError } from '../src/errors.js';
import { languageServerLimits } from '../src/limits.js';
import { createLanguageServerSession } from '../src/session.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/model.puml';

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

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

function openParams(overrides = {}) {
  return {
    textDocument: {
      uri,
      languageId: 'plantuml',
      version: 1,
      text: '@startuml\n@enduml\n',
      ...overrides,
    },
  };
}

function changeParams(version, text, overrides = {}) {
  return {
    textDocument: { uri, version },
    contentChanges: [{ text, ...overrides }],
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setup(overrides = {}) {
  const notifications = [];
  const renderCalls = [];
  const renderer = overrides.renderer ?? Object.freeze({
    async render(request) {
      renderCalls.push(request);
      return Object.freeze({});
    },
  });
  const options = {
    javaPath,
    jarPath,
    rendererFactory(factoryOptions) {
      assert.deepEqual(factoryOptions, { javaPath, jarPath });
      return renderer;
    },
    async publishNotification(method, params) {
      notifications.push({ method, params });
    },
    ...overrides.options,
  };
  return {
    notifications,
    renderCalls,
    session: createLanguageServerSession(options),
  };
}

async function initialize(session) {
  const result = await session.request('initialize', {});
  await session.notify('initialized', {});
  return result;
}

test('diagnostic session options and renderer construction fail closed', () => {
  const cases = [
    null,
    {},
    { javaPath, jarPath, publishNotification() {}, rendererFactory: 'not-callable' },
    { javaPath, jarPath, publishNotification: 'not-callable' },
    { javaPath: 'relative', jarPath, publishNotification() {} },
    new Proxy({}, {
      getPrototypeOf() {
        throw new Error('trap');
      },
    }),
    new Proxy({ javaPath, jarPath, publishNotification() {} }, {
      get(target, property) {
        if (property === 'rendererFactory') throw new Error('trap');
        return target[property];
      },
    }),
  ];
  for (const options of cases) {
    assert.throws(() => createLanguageServerSession(options), LanguageServerError);
  }
  assert.throws(
    () => createLanguageServerSession({
      javaPath,
      jarPath,
      publishNotification() {},
      rendererFactory() { throw new Error('secret'); },
    }),
    (error) => assertError(error, 'renderer_unavailable'),
  );
  for (const renderer of [
    null,
    {},
    { render: 'no' },
    new Proxy({}, {
      get() {
        throw new Error('secret renderer getter');
      },
    }),
  ]) {
    assert.throws(
      () => createLanguageServerSession({
        javaPath,
        jarPath,
        publishNotification() {},
        rendererFactory: () => renderer,
      }),
      (error) => assertError(error, 'renderer_unavailable'),
    );
  }
});

test('diagnostic session returns immutable full-sync capabilities and enforces lifecycle requests', async () => {
  const { session } = setup();
  await assert.rejects(session.request('shutdown'), (error) => assertError(error, 'server_not_initialized'));
  const result = await session.request('initialize', {});
  assert.deepEqual(result, {
    capabilities: {
      positionEncoding: 'utf-16',
      textDocumentSync: { openClose: true, change: 1, save: false },
    },
    serverInfo: { name: 'DiagramWeave Language Server', version: '0.0.0' },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.capabilities), true);
  assert.equal(Object.isFrozen(result.capabilities.textDocumentSync), true);
  await assert.rejects(session.request('initialize', {}), (error) => assertError(error, 'invalid_request'));
  await assert.rejects(session.request('unknown/request'), (error) => assertError(error, 'method_not_found'));
  assert.equal(await session.request('shutdown'), null);
  await assert.rejects(session.request('shutdown'), (error) => assertError(error, 'server_shutting_down'));
});

test('diagnostic session requires initialized before document synchronization', async () => {
  const { session } = setup();
  await session.request('initialize', {});
  await assert.rejects(
    session.notify('textDocument/didOpen', openParams()),
    (error) => assertError(error, 'server_not_ready'),
  );
  await session.notify('initialized', {});
  await session.notify('textDocument/didOpen', openParams());
});

test('diagnostic session rejects invalid initialize and initialized shapes', async () => {
  const { session } = setup();
  await assert.rejects(session.notify('initialized', {}), (error) => assertError(error, 'server_not_initialized'));
  await assert.rejects(session.request('initialize', 'bad'), (error) => assertError(error, 'invalid_request'));

  const second = setup().session;
  await second.request('initialize', null);
  await assert.rejects(second.notify('initialized', 'bad'), (error) => assertError(error, 'invalid_request'));
  await second.notify('initialized', null);
  await assert.rejects(second.notify('initialized', {}), (error) => assertError(error, 'invalid_request'));
});

test('diagnostic session opens validates changes and closes one document', async () => {
  const state = setup();
  await initialize(state.session);
  await state.session.notify('textDocument/didOpen', openParams());
  await state.session.notify('textDocument/didChange', changeParams(2, '@startuml\nAlice -> Bob\n@enduml\n'));
  await state.session.notify('textDocument/didClose', { textDocument: { uri } });

  assert.deepEqual(state.renderCalls, [
    { source: '@startuml\n@enduml\n', format: 'svg' },
    { source: '@startuml\nAlice -> Bob\n@enduml\n', format: 'svg' },
  ]);
  assert.deepEqual(state.notifications.map(({ method, params }) => ({
    method,
    uri: params.uri,
    version: params.version,
    count: params.diagnostics.length,
  })), [
    { method: 'textDocument/publishDiagnostics', uri, version: 1, count: 0 },
    { method: 'textDocument/publishDiagnostics', uri, version: 2, count: 0 },
    { method: 'textDocument/publishDiagnostics', uri, version: 2, count: 0 },
  ]);
  assert.equal(Object.isFrozen(state.notifications[0].params), true);
});

test('diagnostic session publishes source-free syntax and operational diagnostics', async () => {
  const syntaxState = setup({
    renderer: Object.freeze({
      async render() {
        throw new PlantUmlRendererError('renderer_failed', 'safe', {
          diagnostics: [syntaxDiagnostic(1)],
        });
      },
    }),
  });
  await initialize(syntaxState.session);
  await syntaxState.session.notify('textDocument/didOpen', openParams());
  assert.equal(syntaxState.notifications.length, 1);
  assert.equal(syntaxState.notifications[0].params.diagnostics[0].code, 'plantuml.syntax');
  assert.equal(syntaxState.notifications[0].params.diagnostics[0].range.start.line, 1);

  for (const thrown of [
    new PlantUmlRendererError('renderer_timeout', 'safe'),
    new Error('secret source'),
  ]) {
    const state = setup({
      renderer: Object.freeze({ async render() { throw thrown; } }),
    });
    await initialize(state.session);
    await state.session.notify('textDocument/didOpen', openParams());
    assert.deepEqual(state.notifications.map(({ method }) => method), [
      'textDocument/publishDiagnostics',
      'window/logMessage',
    ]);
    assert.equal(state.notifications[0].params.diagnostics[0].code, 'diagramweave.renderer');
    assert.equal(JSON.stringify(state.notifications).includes('secret source'), false);
  }
});

test('diagnostic session rejects malformed open duplicate open and document overflow', async () => {
  const state = setup();
  await initialize(state.session);
  for (const params of [null, {}, { textDocument: null }]) {
    await assert.rejects(
      state.session.notify('textDocument/didOpen', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
  const hostile = {
    textDocument: new Proxy({}, {
      get() {
        throw new Error('secret');
      },
    }),
  };
  await assert.rejects(
    state.session.notify('textDocument/didOpen', hostile),
    (error) => assertError(error, 'invalid_request'),
  );
  await state.session.notify('textDocument/didOpen', openParams());
  await assert.rejects(
    state.session.notify('textDocument/didOpen', openParams()),
    (error) => assertError(error, 'document_already_open'),
  );

  const limitState = setup();
  await initialize(limitState.session);
  for (let index = 0; index < languageServerLimits.maxOpenDocuments; index += 1) {
    await limitState.session.notify('textDocument/didOpen', openParams({
      uri: `file:///workspace/model-${index}.puml`,
    }));
  }
  await assert.rejects(
    limitState.session.notify('textDocument/didOpen', openParams({
      uri: 'file:///workspace/overflow.puml',
    })),
    (error) => assertError(error, 'too_many_documents'),
  );
});

test('diagnostic session collapses hostile top-level document and change getters', async () => {
  const state = setup();
  await initialize(state.session);
  const hostileOpen = Object.defineProperty({}, 'textDocument', {
    get() {
      throw new Error('secret open getter');
    },
  });
  await assert.rejects(
    state.session.notify('textDocument/didOpen', hostileOpen),
    (error) => assertError(error, 'invalid_request'),
  );

  await state.session.notify('textDocument/didOpen', openParams());
  const hostileChanges = new Proxy([], {
    get(target, property, receiver) {
      if (property === 'length') {
        throw new Error('secret length getter');
      }
      return Reflect.get(target, property, receiver);
    },
  });
  await assert.rejects(
    state.session.notify('textDocument/didChange', {
      textDocument: { uri, version: 2 },
      contentChanges: hostileChanges,
    }),
    (error) => assertError(error, 'invalid_request'),
  );

  const hostileClose = Object.defineProperty({}, 'textDocument', {
    get() {
      throw new Error('secret close getter');
    },
  });
  await assert.rejects(
    state.session.notify('textDocument/didClose', hostileClose),
    (error) => assertError(error, 'invalid_request'),
  );
});

test('diagnostic session enforces full-sync changes and increasing versions', async () => {
  const state = setup();
  await initialize(state.session);
  await state.session.notify('textDocument/didOpen', openParams());
  const cases = [
    [null, 'invalid_request'],
    [{}, 'invalid_request'],
    [{ textDocument: { uri, version: 2 }, contentChanges: [] }, 'invalid_request'],
    [{ textDocument: { uri, version: 2 }, contentChanges: [null] }, 'invalid_request'],
    [{ textDocument: { uri, version: 2 }, contentChanges: [{ text: 'x' }, { text: 'y' }] }, 'invalid_request'],
    [changeParams(2, 'x', { range: {} }), 'incremental_change_unsupported'],
    [changeParams(2, 'x', { rangeLength: 0 }), 'incremental_change_unsupported'],
    [changeParams(1, 'x'), 'document_version_out_of_order'],
    [changeParams(0, 'x'), 'document_version_out_of_order'],
  ];
  for (const [params, code] of cases) {
    await assert.rejects(
      state.session.notify('textDocument/didChange', params),
      (error) => assertError(error, code),
    );
  }

  const missing = setup();
  await initialize(missing.session);
  await assert.rejects(
    missing.session.notify('textDocument/didChange', changeParams(2, 'x')),
    (error) => assertError(error, 'document_not_open'),
  );

  const hostile = {
    textDocument: { uri, version: 2 },
    contentChanges: [new Proxy({}, {
      get() {
        throw new Error('secret');
      },
    })],
  };
  await assert.rejects(
    state.session.notify('textDocument/didChange', hostile),
    (error) => assertError(error, 'invalid_request'),
  );
});

test('diagnostic session rejects malformed close and missing documents', async () => {
  const state = setup();
  await initialize(state.session);
  for (const params of [null, {}, { textDocument: null }]) {
    await assert.rejects(
      state.session.notify('textDocument/didClose', params),
      (error) => assertError(error, 'invalid_request'),
    );
  }
  await assert.rejects(
    state.session.notify('textDocument/didClose', { textDocument: { uri } }),
    (error) => assertError(error, 'document_not_open'),
  );
  const hostile = {
    textDocument: new Proxy({}, {
      get() {
        throw new Error('secret');
      },
    }),
  };
  await assert.rejects(
    state.session.notify('textDocument/didClose', hostile),
    (error) => assertError(error, 'invalid_request'),
  );
});

test('diagnostic session discards stale validation after newer version', async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const state = setup({
    renderer: Object.freeze({
      render() {
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      },
    }),
  });
  await initialize(state.session);
  const opening = state.session.notify('textDocument/didOpen', openParams());
  const changing = state.session.notify('textDocument/didChange', changeParams(2, 'new'));
  second.resolve(Object.freeze({}));
  await changing;
  first.reject(new Error('stale secret'));
  await opening;
  assert.deepEqual(state.notifications.map(({ params }) => params.version), [2]);
});

test('diagnostic session discards validations after close shutdown and dispose', async () => {
  for (const action of ['close', 'shutdown', 'dispose']) {
    const pending = deferred();
    const state = setup({
      renderer: Object.freeze({ render: () => pending.promise }),
    });
    await initialize(state.session);
    const opening = state.session.notify('textDocument/didOpen', openParams());
    if (action === 'close') {
      await state.session.notify('textDocument/didClose', { textDocument: { uri } });
    } else if (action === 'shutdown') {
      await state.session.request('shutdown');
    } else {
      state.session.dispose();
    }
    pending.resolve(Object.freeze({}));
    await opening;
    assert.equal(
      state.notifications.filter(({ params }) => params.version === 1 && params.diagnostics.length > 0).length,
      0,
    );
    if (action === 'close') {
      assert.equal(state.notifications.length, 1);
    } else {
      assert.equal(state.notifications.length, 0);
    }
  }
});

test('diagnostic session supports exit ignores unknown notifications and rejects later work', async () => {
  const state = setup();
  await initialize(state.session);
  await state.session.notify('workspace/unknown', { anything: true });
  await state.session.notify('exit');
  await assert.rejects(
    state.session.notify('textDocument/didOpen', openParams()),
    (error) => assertError(error, 'server_shutting_down'),
  );
  await state.session.notify('workspace/unknown', null);
});

test('diagnostic session normalizes notification sink failures', async () => {
  const session = createLanguageServerSession({
    javaPath,
    jarPath,
    rendererFactory: () => Object.freeze({ async render() { return Object.freeze({}); } }),
    publishNotification() {
      throw new Error('host secret');
    },
  });
  await initialize(session);
  await assert.rejects(
    session.notify('textDocument/didOpen', openParams()),
    (error) => {
      assertError(error, 'notification_failed');
      assert.equal(JSON.stringify(error).includes('host secret'), false);
      return true;
    },
  );
});

test('diagnostic session rejects unsafe methods and work outside lifecycle', async () => {
  const { session } = setup();
  for (const method of [null, '', 'bad\u0000method']) {
    await assert.rejects(session.request(method), LanguageServerError);
    await assert.rejects(session.notify(method), LanguageServerError);
  }
  await assert.rejects(
    session.notify('textDocument/didOpen', openParams()),
    (error) => assertError(error, 'server_not_initialized'),
  );
  await initialize(session);
  await session.request('shutdown');
  await assert.rejects(
    session.notify('textDocument/didOpen', openParams()),
    (error) => assertError(error, 'server_shutting_down'),
  );
});

test('diagnostic session preserves expected validation errors and hostile boundaries', async () => {
  const optionTarget = {
    rendererFactory: () => Object.freeze({ async render() { return Object.freeze({}); } }),
    publishNotification() {},
    jarPath,
  };
  const hostileOptions = new Proxy(optionTarget, {
    get(target, property) {
      if (property === 'javaPath') {
        throw new Error('secret option getter');
      }
      return target[property];
    },
  });
  assert.throws(
    () => createLanguageServerSession(hostileOptions),
    (error) => assertError(error, 'invalid_options'),
  );

  const state = setup();
  await initialize(state.session);
  await assert.rejects(
    state.session.notify('textDocument/didOpen', openParams({ uri: 'https://example.com/x.puml' })),
    (error) => assertError(error, 'document_uri_invalid'),
  );
  await state.session.notify('textDocument/didOpen', openParams());
  await assert.rejects(
    state.session.notify('textDocument/didChange', changeParams(-1, 'x')),
    (error) => assertError(error, 'document_version_invalid'),
  );
  await state.session.notify('textDocument/didClose', { textDocument: { uri } });
  await assert.rejects(
    state.session.notify('textDocument/didClose', {
      textDocument: { uri: 'https://example.com/x.puml' },
    }),
    (error) => assertError(error, 'document_uri_invalid'),
  );
});
