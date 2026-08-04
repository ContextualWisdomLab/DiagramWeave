import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InvalidEditProposalError,
  hashSource,
} from '../../core/src/index.js';
import {
  ContextualOrchestratorError,
  buildEditProposalMessages,
  createContextualOrchestratorClient,
  extractAssistantJson,
} from '../src/index.js';

const source = '@startuml\nAlice -> Bob: hello\n@enduml\n';
const selectionStart = source.indexOf('hello');
const selectionEnd = selectionStart + 'hello'.length;

function validRequest(overrides = {}) {
  return {
    documentId: 'diagram_document_alpha',
    source,
    operationType: 'modify_selection',
    requestedScope: { start: selectionStart, end: selectionEnd },
    instruction: 'Replace the selected label with goodbye.',
    ...overrides,
  };
}

function validProposal(overrides = {}) {
  return {
    schemaVersion: '1.0',
    proposalId: 'proposal_alpha',
    documentId: 'diagram_document_alpha',
    baseRevisionHash: hashSource(source),
    operationType: 'modify_selection',
    requestedScope: { start: selectionStart, end: selectionEnd },
    effectiveScope: { start: selectionStart, end: selectionEnd },
    replacement: 'goodbye',
    summary: 'Replace the selected message label.',
    assumptions: ['The selected text is the intended message label.'],
    ...overrides,
  };
}

function assistantResponse(content, status = 200) {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

test('buildEditProposalMessages returns frozen source-first prompt messages', () => {
  const messages = buildEditProposalMessages(validRequest());
  const payload = JSON.parse(messages[1].content);

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.match(messages[0].content, /untrusted data/i);
  assert.match(messages[0].content, /exactly one JSON object/i);
  assert.equal(messages[1].role, 'user');
  assert.deepEqual(payload, {
    task: 'diagramweave_edit_proposal',
    schemaVersion: '1.0',
    documentId: 'diagram_document_alpha',
    baseRevisionHash: hashSource(source),
    operationType: 'modify_selection',
    requestedScope: { start: selectionStart, end: selectionEnd },
    instruction: 'Replace the selected label with goodbye.',
    source,
  });
  assert.equal(Object.isFrozen(messages), true);
  assert.equal(Object.isFrozen(messages[0]), true);
  assert.equal(Object.isFrozen(messages[1]), true);
});

test('buildEditProposalMessages accepts a null-prototype request record', () => {
  const request = Object.assign(Object.create(null), validRequest());
  assert.equal(buildEditProposalMessages(request)[1].role, 'user');
});

const invalidRequests = [
  ['request must be a plain object', null, 'request'],
  ['document id must be a string', { documentId: 42 }, 'documentId'],
  ['document id is required', { documentId: '   ' }, 'documentId'],
  ['document id is bounded', { documentId: 'x'.repeat(257) }, 'documentId'],
  ['source must be a string', { source: 42 }, 'source'],
  ['source is bounded', { source: 'x'.repeat(262145), requestedScope: { start: 0, end: 0 } }, 'source'],
  ['operation type is supported', { operationType: 'delete_workspace' }, 'operationType'],
  ['requested scope is a plain object', { requestedScope: [] }, 'requestedScope'],
  ['scope start is an integer', { requestedScope: { start: 1.5, end: 2 } }, 'requestedScope.start'],
  ['scope start is nonnegative', { requestedScope: { start: -1, end: 2 } }, 'requestedScope.start'],
  ['scope end is an integer', { requestedScope: { start: 0, end: 1.5 } }, 'requestedScope.end'],
  ['scope end follows start', { requestedScope: { start: 3, end: 2 } }, 'requestedScope.end'],
  ['scope end stays in source', { requestedScope: { start: 0, end: source.length + 1 } }, 'requestedScope.end'],
  ['instruction must be a string', { instruction: 42 }, 'instruction'],
  ['instruction is required', { instruction: '   ' }, 'instruction'],
  ['instruction is bounded', { instruction: 'x'.repeat(8193) }, 'instruction'],
];

for (const [name, override, field] of invalidRequests) {
  test(`buildEditProposalMessages rejects when ${name}`, () => {
    const request = override === null ? null : validRequest(override);
    assert.throws(
      () => buildEditProposalMessages(request),
      (error) => {
        assert.equal(error instanceof ContextualOrchestratorError, true);
        assert.equal(error.code, 'invalid_request');
        assert.equal(error.field, field);
        return true;
      },
    );
  });
}

test('extractAssistantJson accepts raw and fenced JSON only', () => {
  assert.deepEqual(extractAssistantJson('{"answer":1}'), { answer: 1 });
  assert.deepEqual(extractAssistantJson('```json\n{"answer":2}\n```'), { answer: 2 });
  assert.deepEqual(extractAssistantJson('```\n{"answer":3}\n```'), { answer: 3 });
});

const invalidAssistantContent = [
  ['content must be a string', 42],
  ['content is required', '   '],
  ['prose around JSON is rejected', 'Here is the result: {"answer":1}'],
  ['malformed JSON is rejected', '{"answer":'],
];

for (const [name, content] of invalidAssistantContent) {
  test(`extractAssistantJson rejects when ${name}`, () => {
    assert.throws(
      () => extractAssistantJson(content),
      (error) => {
        assert.equal(error instanceof ContextualOrchestratorError, true);
        assert.equal(error.code, 'assistant_json_invalid');
        assert.equal(error.status, undefined);
        return true;
      },
    );
  });
}

const invalidClientOptions = [
  ['options must be a plain object', null, 'options'],
  ['base URL must be a string', { baseUrl: 42 }, 'baseUrl'],
  ['base URL must parse', { baseUrl: 'not a URL' }, 'baseUrl'],
  ['base URL protocol is restricted', { baseUrl: 'ftp://example.com' }, 'baseUrl'],
  ['remote HTTP is prohibited', { baseUrl: 'http://example.com' }, 'baseUrl'],
  ['base URL credentials are prohibited', { baseUrl: 'https://user:pass@example.com' }, 'baseUrl'],
  ['base URL query is prohibited', { baseUrl: 'https://example.com?secret=value' }, 'baseUrl'],
  ['base URL fragment is prohibited', { baseUrl: 'https://example.com#fragment' }, 'baseUrl'],
  ['token must be a string', { baseUrl: 'https://example.com', token: 42 }, 'token'],
  ['token is required when present', { baseUrl: 'https://example.com', token: '   ' }, 'token'],
  ['token cannot contain controls', { baseUrl: 'https://example.com', token: 'secret\nvalue' }, 'token'],
  ['token is bounded', { baseUrl: 'https://example.com', token: 'x'.repeat(8193) }, 'token'],
  ['model must be a string', { baseUrl: 'https://example.com', model: 42 }, 'model'],
  ['model is required', { baseUrl: 'https://example.com', model: '  ' }, 'model'],
  ['model is bounded', { baseUrl: 'https://example.com', model: 'x'.repeat(257) }, 'model'],
  ['timeout is an integer', { baseUrl: 'https://example.com', timeoutMs: 10.5 }, 'timeoutMs'],
  ['timeout has a minimum', { baseUrl: 'https://example.com', timeoutMs: 9 }, 'timeoutMs'],
  ['timeout has a maximum', { baseUrl: 'https://example.com', timeoutMs: 120001 }, 'timeoutMs'],
  ['fetch implementation is callable', { baseUrl: 'https://example.com', fetchImpl: 42 }, 'fetchImpl'],
];

for (const [name, options, field] of invalidClientOptions) {
  test(`createContextualOrchestratorClient rejects when ${name}`, () => {
    assert.throws(
      () => createContextualOrchestratorClient(options),
      (error) => {
        assert.equal(error instanceof ContextualOrchestratorError, true);
        assert.equal(error.code, 'invalid_client_options');
        assert.equal(error.field, field);
        return true;
      },
    );
  });
}

test('client sends a bounded OpenAI-compatible request and validates the proposal', async () => {
  let observedUrl;
  let observedOptions;
  const fetchImpl = async (url, options) => {
    observedUrl = url;
    observedOptions = options;
    return assistantResponse(JSON.stringify(validProposal()));
  };
  const client = createContextualOrchestratorClient({
    baseUrl: 'http://127.0.0.1:8000/gateway',
    token: 'operator_secret',
    model: 'contextual-orchestrator',
    timeoutMs: 5000,
    fetchImpl,
  });

  const result = await client.requestEditProposal(validRequest());
  const body = JSON.parse(observedOptions.body);

  assert.equal(observedUrl, 'http://127.0.0.1:8000/gateway/v1/chat/completions');
  assert.equal(observedOptions.method, 'POST');
  assert.equal(observedOptions.headers.accept, 'application/json');
  assert.equal(observedOptions.headers['content-type'], 'application/json');
  assert.equal(observedOptions.headers.authorization, 'Bearer operator_secret');
  assert.equal(body.model, 'contextual-orchestrator');
  assert.equal(body.temperature, 0);
  assert.equal(body.stream, false);
  assert.equal(body.messages.length, 2);
  assert.equal(result.proposalId, 'proposal_alpha');
  assert.equal(result.scopeExpanded, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(client), true);
});

test('client supports HTTPS without an authorization header and default options', async () => {
  let observedOptions;
  const client = createContextualOrchestratorClient({
    baseUrl: 'https://orchestrator.example.test',
    fetchImpl: async (_url, options) => {
      observedOptions = options;
      return assistantResponse(JSON.stringify(validProposal()));
    },
  });

  await client.requestEditProposal(validRequest());
  assert.equal('authorization' in observedOptions.headers, false);
  assert.equal(JSON.parse(observedOptions.body).model, 'contextual-orchestrator');
});

test('client uses the global fetch implementation when none is supplied', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return assistantResponse(JSON.stringify(validProposal()));
  };
  try {
    const client = createContextualOrchestratorClient({
      baseUrl: 'https://orchestrator.example.test',
    });
    await client.requestEditProposal(validRequest());
    assert.equal(called, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('client accepts every loopback HTTP hostname', () => {
  for (const baseUrl of [
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://[::1]:8000',
  ]) {
    assert.equal(
      Object.isFrozen(createContextualOrchestratorClient({ baseUrl, fetchImpl: async () => {} })),
      true,
    );
  }
});

test('client rejects non-success HTTP responses without reading their bodies', async () => {
  let bodyRead = false;
  const client = createContextualOrchestratorClient({
    baseUrl: 'https://orchestrator.example.test',
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => {
        bodyRead = true;
        return { secret: 'must_not_be_read' };
      },
    }),
  });

  await assert.rejects(
    client.requestEditProposal(validRequest()),
    (error) => {
      assert.equal(error instanceof ContextualOrchestratorError, true);
      assert.equal(error.code, 'provider_http_error');
      assert.equal(error.status, 503);
      assert.equal(bodyRead, false);
      return true;
    },
  );
});

test('client omits an invalid provider status from the safe HTTP error', async () => {
  const client = createContextualOrchestratorClient({
    baseUrl: 'https://orchestrator.example.test',
    fetchImpl: async () => ({ ok: false, status: '503' }),
  });

  await assert.rejects(
    client.requestEditProposal(validRequest()),
    (error) => {
      assert.equal(error.code, 'provider_http_error');
      assert.equal(error.status, undefined);
      return true;
    },
  );
});

test('client reports invalid provider JSON and missing assistant content', async () => {
  const invalidJsonClient = createContextualOrchestratorClient({
    baseUrl: 'https://orchestrator.example.test',
    fetchImpl: async () => new Response('not json', { status: 200 }),
  });
  await assert.rejects(
    invalidJsonClient.requestEditProposal(validRequest()),
    (error) => error.code === 'provider_response_invalid',
  );

  const missingContentClient = createContextualOrchestratorClient({
    baseUrl: 'https://orchestrator.example.test',
    fetchImpl: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
  });
  await assert.rejects(
    missingContentClient.requestEditProposal(validRequest()),
    (error) => error.code === 'provider_response_invalid',
  );
});

test('client distinguishes provider unavailability from timeout', async () => {
  const unavailableClient = createContextualOrchestratorClient({
    baseUrl: 'https://orchestrator.example.test',
    fetchImpl: async () => {
      throw new Error('network detail must not escape');
    },
  });
  await assert.rejects(
    unavailableClient.requestEditProposal(validRequest()),
    (error) => {
      assert.equal(error.code, 'provider_unavailable');
      assert.doesNotMatch(error.message, /network detail/);
      return true;
    },
  );

  const timeoutClient = createContextualOrchestratorClient({
    baseUrl: 'https://orchestrator.example.test',
    timeoutMs: 10,
    fetchImpl: async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }),
  });
  await assert.rejects(
    timeoutClient.requestEditProposal(validRequest()),
    (error) => error.code === 'provider_timeout',
  );
});

test('client passes strict assistant output through core proposal validation', async () => {
  const client = createContextualOrchestratorClient({
    baseUrl: 'https://orchestrator.example.test',
    fetchImpl: async () => assistantResponse(JSON.stringify(validProposal({ summary: '   ' }))),
  });

  await assert.rejects(
    client.requestEditProposal(validRequest()),
    (error) => {
      assert.equal(error instanceof InvalidEditProposalError, true);
      assert.equal(error.field, 'summary');
      return true;
    },
  );
});
