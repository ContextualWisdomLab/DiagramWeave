import { plantUmlRendererLimits } from '@contextualwisdomlab/diagramweave-plantuml-renderer';

/**
 * Immutable resource limits for one in-memory Language Server session.
 */
export const languageServerLimits = Object.freeze({
  maxCompletionItems: 64,
  maxDocumentBytes: plantUmlRendererLimits.maxSourceBytes.default,
  maxDocumentSymbols: 1024,
  maxOpenDocuments: 256,
  maxSymbolNameBytes: 1024,
  maxUriBytes: 4096,
});
