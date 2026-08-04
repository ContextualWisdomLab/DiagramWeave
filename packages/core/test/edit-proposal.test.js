import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InvalidEditProposalError,
  RevisionConflictError,
  ScopeExpansionRequiredError,
  applyEditProposal,
  hashSource,
  previewEditProposal,
  validateEditProposal,
} from '../src/index.js';

const source = '@startuml\nAlice -> Bob: hello\n@enduml\n';
const selectionStart = source.indexOf('hello');
const selectionEnd = selectionStart + 'hello'.length;

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

test('validateEditProposal normalizes and freezes a valid proposal', () => {
  const input = validProposal();
  const result = validateEditProposal(input, source);

  assert.notEqual(result, input);
  assert.equal(result.scopeExpanded, false);
  assert.deepEqual(result.requestedScope, input.requestedScope);
  assert.deepEqual(result.effectiveScope, input.effectiveScope);
  assert.deepEqual(result.assumptions, input.assumptions);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.requestedScope), true);
  assert.equal(Object.isFrozen(result.effectiveScope), true);
  assert.equal(Object.isFrozen(result.assumptions), true);
});

test('validateEditProposal accepts plain records with a null prototype', () => {
  const input = Object.assign(Object.create(null), validProposal());
  const result = validateEditProposal(input, source);

  assert.equal(result.proposalId, 'proposal_alpha');
  assert.equal(result.scopeExpanded, false);
});

test('previewEditProposal returns deterministic before and after revisions', () => {
  const result = previewEditProposal(source, validProposal());

  assert.equal(result.nextSource, '@startuml\nAlice -> Bob: goodbye\n@enduml\n');
  assert.equal(result.previousRevisionHash, hashSource(source));
  assert.equal(result.nextRevisionHash, hashSource(result.nextSource));
  assert.equal(result.proposal.scopeExpanded, false);
  assert.equal(Object.isFrozen(result), true);
});

test('applyEditProposal returns only the accepted next source', () => {
  assert.equal(
    applyEditProposal(source, validProposal()),
    '@startuml\nAlice -> Bob: goodbye\n@enduml\n',
  );
});

test('scope expansion requires an explicit approval and reason', () => {
  const expanded = validProposal({
    effectiveScope: { start: source.indexOf('Alice'), end: selectionEnd },
    replacement: 'Alice -> Bob: goodbye',
    scopeExpansionReason: 'The complete relationship statement must change.',
  });

  const normalized = validateEditProposal(expanded, source);
  assert.equal(normalized.scopeExpanded, true);
  assert.throws(
    () => previewEditProposal(source, expanded),
    (error) => {
      assert.equal(error instanceof ScopeExpansionRequiredError, true);
      assert.equal(error.code, 'scope_expansion_required');
      assert.equal(error.proposalId, 'proposal_alpha');
      return true;
    },
  );
  assert.match(
    previewEditProposal(source, expanded, { allowScopeExpansion: true }).nextSource,
    /Alice -> Bob: goodbye/,
  );
});

test('scope expansion can extend the requested end boundary', () => {
  const expanded = validProposal({
    effectiveScope: { start: selectionStart, end: source.indexOf('@enduml') },
    replacement: 'goodbye\n',
    scopeExpansionReason: 'The message terminator must be replaced with the label.',
  });

  const result = previewEditProposal(source, expanded, { allowScopeExpansion: true });
  assert.equal(result.proposal.scopeExpanded, true);
  assert.match(result.nextSource, /Bob: goodbye/);
});

test('revision conflicts fail closed before applying a patch', () => {
  const stale = validProposal({ baseRevisionHash: hashSource(`${source}' changed`) });

  assert.throws(
    () => validateEditProposal(stale, source),
    (error) => {
      assert.equal(error instanceof RevisionConflictError, true);
      assert.equal(error.code, 'revision_conflict');
      assert.equal(error.expectedRevisionHash, hashSource(source));
      assert.equal(error.actualRevisionHash, stale.baseRevisionHash);
      return true;
    },
  );
});

const invalidCases = [
  ['proposal must be a plain object', null, 'proposal'],
  ['schema version is fixed', { schemaVersion: '2.0' }, 'schemaVersion'],
  ['proposal id is a string', { proposalId: 42 }, 'proposalId'],
  ['proposal id is required', { proposalId: '' }, 'proposalId'],
  ['proposal id is bounded', { proposalId: 'x'.repeat(129) }, 'proposalId'],
  ['document id is a string', { documentId: 42 }, 'documentId'],
  ['document id is required', { documentId: '  ' }, 'documentId'],
  ['document id is bounded', { documentId: 'x'.repeat(257) }, 'documentId'],
  ['base revision is hexadecimal', { baseRevisionHash: 'not-a-hash' }, 'baseRevisionHash'],
  ['operation type is supported', { operationType: 'delete_workspace' }, 'operationType'],
  ['requested scope is an object', { requestedScope: [] }, 'requestedScope'],
  ['scope start is an integer', { requestedScope: { start: 1.5, end: 2 } }, 'requestedScope.start'],
  ['scope start is nonnegative', { requestedScope: { start: -1, end: 2 } }, 'requestedScope.start'],
  ['scope end is an integer', { requestedScope: { start: 0, end: 1.5 } }, 'requestedScope.end'],
  ['scope end follows start', { requestedScope: { start: 3, end: 2 } }, 'requestedScope.end'],
  ['scope end stays in source', { requestedScope: { start: 0, end: source.length + 1 } }, 'requestedScope.end'],
  ['effective scope is valid', { effectiveScope: { start: 0, end: source.length + 1 } }, 'effectiveScope.end'],
  ['replacement is a string', { replacement: 42 }, 'replacement'],
  ['replacement is bounded', { replacement: 'x'.repeat(262145) }, 'replacement'],
  ['summary is a string', { summary: 42 }, 'summary'],
  ['summary is required', { summary: '   ' }, 'summary'],
  ['summary is bounded', { summary: 'x'.repeat(4097) }, 'summary'],
  ['assumptions is an array', { assumptions: 'none' }, 'assumptions'],
  ['assumptions count is bounded', { assumptions: Array(33).fill('a') }, 'assumptions'],
  ['assumptions contain strings', { assumptions: [42] }, 'assumptions[0]'],
  ['assumptions are nonempty', { assumptions: ['   '] }, 'assumptions[0]'],
  ['assumption is bounded', { assumptions: ['x'.repeat(1025)] }, 'assumptions[0]'],
  [
    'scope expansion requires a reason',
    { effectiveScope: { start: 0, end: selectionEnd } },
    'scopeExpansionReason',
  ],
  [
    'scope expansion reason is a string',
    { effectiveScope: { start: 0, end: selectionEnd }, scopeExpansionReason: 42 },
    'scopeExpansionReason',
  ],
  [
    'scope expansion reason is nonempty',
    { effectiveScope: { start: 0, end: selectionEnd }, scopeExpansionReason: '   ' },
    'scopeExpansionReason',
  ],
  [
    'scope expansion reason is bounded',
    {
      effectiveScope: { start: 0, end: selectionEnd },
      scopeExpansionReason: 'x'.repeat(2049),
    },
    'scopeExpansionReason',
  ],
  ['unexpanded proposals reject a stray reason', { scopeExpansionReason: 'unneeded' }, 'scopeExpansionReason'],
];

for (const [name, override, field] of invalidCases) {
  test(`validateEditProposal rejects when ${name}`, () => {
    const candidate = override === null ? null : validProposal(override);
    assert.throws(
      () => validateEditProposal(candidate, source),
      (error) => {
        assert.equal(error instanceof InvalidEditProposalError, true);
        assert.equal(error.code, 'invalid_edit_proposal');
        assert.equal(error.field, field);
        return true;
      },
    );
  });
}

test('all supported operation types validate', () => {
  for (const operationType of ['generate', 'modify_selection', 'modify_document', 'repair']) {
    assert.equal(
      validateEditProposal(validProposal({ operationType }), source).operationType,
      operationType,
    );
  }
});
