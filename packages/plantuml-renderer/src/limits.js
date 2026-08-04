/**
 * Freeze one renderer limit descriptor so callers cannot mutate the contract.
 *
 * @param {number} defaultValue - Default value used when the option is omitted.
 * @param {number} minimum - Inclusive supported minimum.
 * @param {number} maximum - Inclusive supported maximum.
 * @returns {Readonly<{default: number, minimum: number, maximum: number}>} Frozen descriptor.
 */
function createLimit(defaultValue, minimum, maximum) {
  return Object.freeze({ default: defaultValue, minimum, maximum });
}

/**
 * Authoritative byte and time limits for the local PlantUML renderer.
 *
 * Hosts may use this immutable object to build configuration UIs and validate
 * deployment policy without duplicating package constants. Each descriptor
 * contains the default value and inclusive supported minimum and maximum.
 */
export const plantUmlRendererLimits = Object.freeze({
  timeoutMs: createLimit(15000, 10, 120000),
  maxSourceBytes: createLimit(1048576, 1, 16777216),
  maxOutputBytes: createLimit(16777216, 1, 67108864),
  maxDiagnosticBytes: createLimit(65536, 1, 1048576),
});
