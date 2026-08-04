import { readFile, rm, writeFile } from 'node:fs/promises';

const rendererPath = 'packages/plantuml-renderer/src/renderer.js';
const legacyParserPath = 'packages/plantuml-renderer/src/diagnostics.js';
const legacyTestPath = 'packages/plantuml-renderer/test/diagnostics.test.js';

/**
 * Replace one exact source fragment and fail when the reviewed base drifted.
 *
 * @param {string} text - Current file contents.
 * @param {string} before - Exact reviewed source fragment.
 * @param {string} after - Replacement source fragment.
 * @param {string} label - Stable failure label.
 * @returns {string} Updated file contents.
 */
function replaceExactly(text, before, after, label) {
  const occurrences = text.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: expected one source fragment, found ${occurrences}.`);
  }
  return text.replace(before, after);
}

let renderer = await readFile(rendererPath, 'utf8');
renderer = replaceExactly(
  renderer,
  "import { PlantUmlRendererError } from './errors.js';\n",
  "import { PlantUmlRendererError } from './errors.js';\n" +
    "import { parsePlantUmlStandardReport } from './standard-report.js';\n",
  'renderer parser import',
);

const inspectorStart = renderer.indexOf(
  '/**\n * Inspect the bounded PlantUML standard report without exposing its contents.',
);
const artifactStart = renderer.indexOf(
  '/**\n * Create an immutable JSON-serializable render artifact.',
  inspectorStart,
);
if (inspectorStart === -1 || artifactStart === -1 || inspectorStart >= artifactStart) {
  throw new Error('standard-report inspector markers did not match the reviewed base.');
}
renderer = `${renderer.slice(0, inspectorStart)}${renderer.slice(artifactStart)}`;

const closeStart = renderer.indexOf(
  '      const diagnosticStatus = inspectStandardReport(\n',
);
const outputStart = renderer.indexOf(
  '      const output = Buffer.concat(outputChunks, outputBytes);\n',
  closeStart,
);
if (closeStart === -1 || outputStart === -1 || closeStart >= outputStart) {
  throw new Error('renderer close-handler markers did not match the reviewed base.');
}
const replacement = `      const standardReport = parsePlantUmlStandardReport(
        Buffer.concat(diagnosticChunks, diagnosticBytes),
      );
      if (
        exitCode !== 0 ||
        signal !== null ||
        standardReport.status === 'error' ||
        standardReport.status === 'invalid'
      ) {
        const details = { diagnostics: standardReport.diagnostics };
        if (Number.isInteger(exitCode)) {
          details.exitCode = exitCode;
        }
        if (typeof signal === 'string') {
          details.signal = signal;
        }
        fail(
          new PlantUmlRendererError(
            'renderer_failed',
            'PlantUML rejected the source or failed to render it.',
            details,
          ),
        );
        return;
      }
`;
renderer = `${renderer.slice(0, closeStart)}${replacement}${renderer.slice(outputStart)}`;
await writeFile(rendererPath, renderer);

await rm(legacyParserPath, { force: true });
await rm(legacyTestPath, { force: true });
