import { createHash } from 'node:crypto';

import { InvalidSourceError } from './errors.js';

/**
 * Return a deterministic lowercase SHA-256 revision for a UTF-8 diagram source.
 *
 * @param {string} source - Exact source text whose revision is required.
 * @returns {string} Sixty-four-character lowercase hexadecimal SHA-256 digest.
 * @throws {InvalidSourceError} When source is not a JavaScript string.
 */
export function hashSource(source) {
  if (typeof source !== 'string') {
    throw new InvalidSourceError();
  }
  return createHash('sha256').update(source, 'utf8').digest('hex');
}
