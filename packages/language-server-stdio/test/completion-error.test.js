import assert from 'node:assert/strict';
import test from 'node:test';

import { LanguageServerError } from '@contextualwisdomlab/diagramweave-language-server';

import { responseForSessionError } from '../src/json-rpc.js';

test('maps invalid completion positions to JSON-RPC invalid params', () => {
  const response = responseForSessionError(
    17,
    new LanguageServerError('document_position_invalid', 'secret position'),
  );
  assert.deepEqual(response, {
    jsonrpc: '2.0',
    id: 17,
    error: {
      code: -32602,
      message: 'Invalid params.',
      data: { diagramweaveCode: 'document_position_invalid' },
    },
  });
  assert.equal(JSON.stringify(response).includes('secret position'), false);
});
