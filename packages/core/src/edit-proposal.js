import {
  InvalidEditProposalError,
  RevisionConflictError,
  ScopeExpansionRequiredError,
} from './errors.js';
import { hashSource } from './revision.js';

const supportedOperationTypes = new Set([
  'generate',
  'modify_selection',
  'modify_document',
  'repair',
]);

/**
 * Raise a stable proposal validation error.
 *
 * @param {string} field - Field path that failed validation.
 * @param {string} message - Human-readable validation failure.
 * @throws {InvalidEditProposalError} Always.
 */
function rejectProposal(field, message) {
  throw new InvalidEditProposalError(field, message);
}

/**
 * Return whether a value is a non-array object with Object.prototype or null as its prototype.
 *
 * @param {unknown} value - Value to inspect.
 * @returns {boolean} True only for plain record-like objects.
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Validate and normalize a required bounded string.
 *
 * @param {unknown} value - Candidate string value.
 * @param {string} field - Field path used in validation errors.
 * @param {number} maximumLength - Maximum normalized string length.
 * @returns {string} Trimmed nonempty string.
 */
function requiredString(value, field, maximumLength) {
  if (typeof value !== 'string') {
    rejectProposal(field, `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    rejectProposal(field, `${field} must not be empty.`);
  }
  if (normalized.length > maximumLength) {
    rejectProposal(field, `${field} must be at most ${maximumLength} characters.`);
  }
  return normalized;
}

/**
 * Validate an edit range against one source revision.
 *
 * @param {unknown} value - Candidate range object.
 * @param {string} field - Root field name for error paths.
 * @param {number} sourceLength - Current source length in UTF-16 code units.
 * @returns {Readonly<{start: number, end: number}>} Frozen validated range.
 */
function validateScope(value, field, sourceLength) {
  if (!isPlainObject(value)) {
    rejectProposal(field, `${field} must be a plain object.`);
  }
  if (!Number.isInteger(value.start)) {
    rejectProposal(`${field}.start`, `${field}.start must be an integer.`);
  }
  if (value.start < 0) {
    rejectProposal(`${field}.start`, `${field}.start must be nonnegative.`);
  }
  if (!Number.isInteger(value.end)) {
    rejectProposal(`${field}.end`, `${field}.end must be an integer.`);
  }
  if (value.end < value.start) {
    rejectProposal(`${field}.end`, `${field}.end must not precede ${field}.start.`);
  }
  if (value.end > sourceLength) {
    rejectProposal(`${field}.end`, `${field}.end must remain inside the current source.`);
  }
  return Object.freeze({ start: value.start, end: value.end });
}

/**
 * Validate an array of bounded human-readable assumptions.
 *
 * @param {unknown} value - Candidate assumptions array.
 * @returns {readonly string[]} Frozen normalized assumptions.
 */
function validateAssumptions(value) {
  if (!Array.isArray(value)) {
    rejectProposal('assumptions', 'assumptions must be an array.');
  }
  if (value.length > 32) {
    rejectProposal('assumptions', 'assumptions must contain at most 32 entries.');
  }
  const assumptions = value.map((assumption, index) =>
    requiredString(assumption, `assumptions[${index}]`, 1024),
  );
  return Object.freeze(assumptions);
}

/**
 * Validate and freeze a revision-bound DiagramWeave edit proposal.
 *
 * The returned proposal owns cloned, frozen scopes and assumptions so callers
 * cannot mutate data after validation. A proposal for a stale source fails
 * closed before any replacement text is computed.
 *
 * @param {unknown} proposal - Untrusted proposal object to validate.
 * @param {string} source - Exact current source text.
 * @returns {Readonly<object>} Normalized immutable proposal.
 * @throws {InvalidEditProposalError} When any proposal field is invalid.
 * @throws {RevisionConflictError} When the proposal targets another revision.
 */
export function validateEditProposal(proposal, source) {
  const expectedRevisionHash = hashSource(source);
  if (!isPlainObject(proposal)) {
    rejectProposal('proposal', 'proposal must be a plain object.');
  }
  if (proposal.schemaVersion !== '1.0') {
    rejectProposal('schemaVersion', 'schemaVersion must equal 1.0.');
  }

  const proposalId = requiredString(proposal.proposalId, 'proposalId', 128);
  const documentId = requiredString(proposal.documentId, 'documentId', 256);

  if (
    typeof proposal.baseRevisionHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(proposal.baseRevisionHash)
  ) {
    rejectProposal('baseRevisionHash', 'baseRevisionHash must be a lowercase SHA-256 digest.');
  }
  if (proposal.baseRevisionHash !== expectedRevisionHash) {
    throw new RevisionConflictError(expectedRevisionHash, proposal.baseRevisionHash);
  }
  if (!supportedOperationTypes.has(proposal.operationType)) {
    rejectProposal('operationType', 'operationType is not supported.');
  }

  const requestedScope = validateScope(proposal.requestedScope, 'requestedScope', source.length);
  const effectiveScope = validateScope(proposal.effectiveScope, 'effectiveScope', source.length);

  if (typeof proposal.replacement !== 'string') {
    rejectProposal('replacement', 'replacement must be a string.');
  }
  if (proposal.replacement.length > 262144) {
    rejectProposal('replacement', 'replacement must be at most 262144 characters.');
  }

  const summary = requiredString(proposal.summary, 'summary', 4096);
  const assumptions = validateAssumptions(proposal.assumptions);
  const scopeExpanded =
    effectiveScope.start < requestedScope.start || effectiveScope.end > requestedScope.end;

  let scopeExpansionReason;
  if (scopeExpanded) {
    scopeExpansionReason = requiredString(
      proposal.scopeExpansionReason,
      'scopeExpansionReason',
      2048,
    );
  } else if (Object.hasOwn(proposal, 'scopeExpansionReason')) {
    rejectProposal(
      'scopeExpansionReason',
      'scopeExpansionReason is allowed only when effectiveScope expands requestedScope.',
    );
  }

  const normalized = {
    schemaVersion: '1.0',
    proposalId,
    documentId,
    baseRevisionHash: proposal.baseRevisionHash,
    operationType: proposal.operationType,
    requestedScope,
    effectiveScope,
    replacement: proposal.replacement,
    summary,
    assumptions,
    scopeExpanded,
  };
  if (scopeExpanded) {
    normalized.scopeExpansionReason = scopeExpansionReason;
  }
  return Object.freeze(normalized);
}

/**
 * Compute an immutable, revision-addressable preview without mutating source text.
 *
 * @param {string} source - Exact current source text.
 * @param {unknown} proposal - Untrusted edit proposal to validate and preview.
 * @param {{allowScopeExpansion?: boolean}} [options] - Explicit approval for an expanded scope.
 * @returns {Readonly<{proposal: Readonly<object>, nextSource: string, previousRevisionHash: string, nextRevisionHash: string}>} Frozen preview.
 * @throws {ScopeExpansionRequiredError} When an expanded scope lacks explicit approval.
 */
export function previewEditProposal(source, proposal, options = {}) {
  const normalized = validateEditProposal(proposal, source);
  if (normalized.scopeExpanded && options.allowScopeExpansion !== true) {
    throw new ScopeExpansionRequiredError(normalized.proposalId);
  }
  const nextSource =
    source.slice(0, normalized.effectiveScope.start) +
    normalized.replacement +
    source.slice(normalized.effectiveScope.end);
  return Object.freeze({
    proposal: normalized,
    nextSource,
    previousRevisionHash: normalized.baseRevisionHash,
    nextRevisionHash: hashSource(nextSource),
  });
}

/**
 * Apply a validated edit proposal and return only the resulting source string.
 *
 * @param {string} source - Exact current source text.
 * @param {unknown} proposal - Untrusted edit proposal to validate and apply.
 * @param {{allowScopeExpansion?: boolean}} [options] - Explicit approval for an expanded scope.
 * @returns {string} New source string; the input string is never mutated.
 */
export function applyEditProposal(source, proposal, options = {}) {
  return previewEditProposal(source, proposal, options).nextSource;
}
