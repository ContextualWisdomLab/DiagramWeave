import { plantUmlRendererLimits } from '@contextualwisdomlab/diagramweave-plantuml-renderer';

/**
 * Immutable resource limits for one in-memory Language Server session.
 */
export const languageServerLimits = Object.freeze({
  maxDocumentBytes: plantUmlRendererLimits.maxSourceBytes.default,
  maxOpenDocuments: 256,
  maxUriBytes: 4096,
});
