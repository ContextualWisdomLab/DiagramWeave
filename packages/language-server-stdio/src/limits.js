/**
 * Immutable resource limits for one DiagramWeave JSON-RPC stdio connection.
 */
export const languageServerStdioLimits = Object.freeze({
  maxHeaderBytes: 8192,
  maxMessageBytes: 2097152,
  maxBufferedBytes: 2105347,
  maxChunkBytes: 4194304,
  maxPendingMessages: 256,
  maxMethodBytes: 256,
  maxStringIdBytes: 256,
});
