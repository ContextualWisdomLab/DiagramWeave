import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '../src/errors.js';
import { createDefinitionLanguageServerSession } from '../src/definition-session.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';
const uri = 'file:///workspace/definition-session.puml';
const defaultSource = [
  'class "Order Service" as OrderService',
  'class Customer',
  'Customer --> OrderService : submits',
].join('\n');

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerError, true);
  assert.equal(error.code, code);
  return true;
}

function setup(renderer = Object.freeze({
  async render() {
    return Object.freeze({});
  },
})) {
  return createDefinitionLanguageServerSession({
    javaPath,
    jarPath,
    rendererFactory: () => renderer,
    async publishNotification() {},
  });
}

function initializeParams(definition = {}) {
  return {
    capabilities: {
      textDocument: {
        definition,
      },
    },
  };
}

function openParams(text = defaultSource, version = 1, documentUri = uri) {
  return {
    textDocument: {
      uri: documentUri,
      languageId: 'plantuml',
      version,
      text,
    },
  };
}

function changeParams(text, version = 2, documentUri = uri) {
  return {
    textDocument: { uri: documentUri, version },
    contentChanges: [{ text }],
  };
}

function definitionParams(line = 2, character = 16, documentUri = uri) {
  return {
    textDocument: { uri: documentUri },
    position: { line, character },
  };
}

async function initialize(session, definition = {}) {
  const result = await session.request('initialize', initializeParams(definition));
  await session.notify('initialized', {});
  return result;
}

async function definition(session, line = 2, character = 16, documentUri = uri) {
  return session.request(
    'textDocument/definition',
    definitionParams(line, character, documentUri),
  );
}

test('advertises definition and serves the latest accepted source snapshot', async () => {
  const session = setup();
  await assert.rejects(
    definition(session),
    (error) => assertError(error, 'server_not_initialized'),
  );

  const result = await session.request('initialize', initializeParams());
  assert.equal(result.capabilities.definitionProvider, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.capabilities), true);
  await assert.rejects(
    definition(session),
    (error) => assertError(error, 'server_not_ready'),
  );

  await session.notify('initialized', {});
  await assert.rejects(
    definition(session),
    (error) => assertError(error, 'document_not_open'),
  );

  await session.notify('textDocument/didOpen', openParams());
  assert.deepEqual(await definition(session), {
    uri,
    range: {
      start: { line: 0, character: 7 },
      end: { line: 0, character: 20 },
    },
  });

  await session.notify('textDocument/didChange', changeParams([
    'component "API Gateway" as ApiGateway',
    'ApiGateway --> ApiGateway',
  ].join('\n')));
  assert.deepEqual(await definition(session, 1, 2), {
    uri,
    range: {
      start: { line: 0, character: 11 },
      end: { line: 0, character: 22 },
    },
  });

  await session.notify('textDocument/didClose', { textDocument: { uri } });
  await assert.rejects(
    definition(session, 1, 2),
    (error) => assertError(error, 'document_not_open'),
  );
});

test('does not advertise or serve definition without a valid negotiated capability', async () => {
  for (const params of [
    {},
    { capabilities: [] },
    { capabilities: {} },
    { capabilities: { textDocument: [] } },
    { capabilities: { textDocument: {} } },
    { capabilities: { textDocument: { definition: [] } } },
    { capabilities: { textDocument: { definition: 'yes' } } },
  ]) {
    const session = setup();
    const result = await session.request('initialize', params);
    assert.equal(result.capabilities.definitionProvider, undefined);
    await session.notify('initialized', {});
    await assert.rejects(
      definition(session),
      (error) => assertError(error, 'method_not_found'),
    );
  }
});
