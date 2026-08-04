/**
 * Return deterministic help text for the CLI or one command.
 *
 * @param {string|null} topic - Optional validate or render topic.
 * @returns {string} Newline-terminated help text.
 */
function helpText(topic) {
  const common = [
    'Renderer configuration:',
    '  --java <absolute-path>  or DIAGRAMWEAVE_JAVA_PATH',
    '  --jar <absolute-path>   or DIAGRAMWEAVE_PLANTUML_JAR_PATH',
    '',
    'Exit codes: 0 success, 1 diagram failure, 2 invocation or operational failure.',
  ];
  if (topic === 'validate') {
    return [
      'Usage: dweave validate <file-or-directory> [--java <path>] [--jar <path>] [--json]',
      '',
      'Validates every selected .puml or .plantuml source through the sandboxed local renderer.',
      ...common,
      '',
    ].join('\n');
  }
  if (topic === 'render') {
    return [
      'Usage: dweave render <file-or-directory> --output <path> [--format svg|png] [--overwrite] [--java <path>] [--jar <path>] [--json]',
      '',
      'Renders one file or a deterministic recursive directory batch.',
      ...common,
      '',
    ].join('\n');
  }
  return [
    'DiagramWeave CLI',
    '',
    'Usage:',
    '  dweave validate <file-or-directory> [options]',
    '  dweave render <file-or-directory> --output <path> [options]',
    '',
    'Commands:',
    '  validate  Validate PlantUML sources without publishing artifacts.',
    '  render    Render PlantUML sources as SVG or PNG.',
    '',
    'Use dweave <command> --help for command details.',
    ...common,
    '',
  ].join('\n');
}

/**
 * Serialize one immutable CLI report as canonical JSON or safe human-readable text.
 *
 * @param {Readonly<object>} report - Execution report.
 * @param {boolean} json - Whether to emit one-line JSON.
 * @returns {string} Newline-terminated serialized report.
 */
export function formatCliReport(report, json) {
  if (json) {
    return `${JSON.stringify(report)}\n`;
  }
  if (report.command === 'help') {
    return helpText(report.helpTopic);
  }

  const lines = [];
  if (report.errorCode !== null) {
    lines.push(`ERROR [${report.errorCode}] ${report.errorMessage}`);
  }
  for (const file of report.files) {
    if (file.status === 'failed') {
      const destination = file.outputPath === null ? '' : ` -> ${file.outputPath}`;
      lines.push(
        `FAIL ${file.relativePath}${destination} [${file.errorCode}] ${file.errorMessage}`,
      );
    } else {
      const label = file.status === 'valid' ? 'VALID' : 'RENDERED';
      const destination = file.outputPath === null ? '' : ` -> ${file.outputPath}`;
      lines.push(`${label} ${file.relativePath}${destination}`);
    }
  }
  if (report.inputKind !== null) {
    lines.push(
      `Summary: ${report.totals.succeeded}/${report.totals.selected} succeeded; ${report.totals.failed} failed.`,
    );
  }
  return `${lines.join('\n')}\n`;
}
