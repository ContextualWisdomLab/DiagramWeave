/**
 * Error raised when a diagram source value is not a string.
 */
export class InvalidSourceError extends TypeError {
  /**
   * Create the stable invalid-source error used by public source utilities.
   */
  constructor() {
    super('Diagram source must be a string.');
    this.name = 'InvalidSourceError';
    this.code = 'invalid_source';
  }
}

/**
 * Error raised when an edit proposal violates the public proposal contract.
 */
export class InvalidEditProposalError extends TypeError {
  /**
   * Create a field-addressable validation error.
   *
   * @param {string} field - Proposal field whose value is invalid.
   * @param {string} message - Human-readable validation failure.
   */
  constructor(field, message) {
    super(message);
    this.name = 'InvalidEditProposalError';
    this.code = 'invalid_edit_proposal';
    this.field = field;
  }
}

/**
 * Error raised when a proposal targets a source revision other than the current revision.
 */
export class RevisionConflictError extends Error {
  /**
   * Create a revision conflict containing both compared hashes.
   *
   * @param {string} expectedRevisionHash - Hash of the current source.
   * @param {string} actualRevisionHash - Hash supplied by the proposal.
   */
  constructor(expectedRevisionHash, actualRevisionHash) {
    super('The edit proposal was created for a different source revision.');
    this.name = 'RevisionConflictError';
    this.code = 'revision_conflict';
    this.expectedRevisionHash = expectedRevisionHash;
    this.actualRevisionHash = actualRevisionHash;
  }
}

/**
 * Error raised when an expanded AI edit scope has not received explicit approval.
 */
export class ScopeExpansionRequiredError extends Error {
  /**
   * Create a scope-expansion approval error for one proposal.
   *
   * @param {string} proposalId - Identifier of the blocked proposal.
   */
  constructor(proposalId) {
    super('The edit proposal expands beyond the requested scope and requires explicit approval.');
    this.name = 'ScopeExpansionRequiredError';
    this.code = 'scope_expansion_required';
    this.proposalId = proposalId;
  }
}
