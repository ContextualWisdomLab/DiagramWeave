import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCliArguments } from '../src/arguments.js';
import { CliError, cliExitCodes } from '../src/errors.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\bin\\java.exe' : '/opt/java/bin/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml/plantuml.jar';

function environment(overrides = {}) {
  return {
    DIAGRAMWEAVE_JAVA_PATH: javaPath,
    DIAGRAMWEAVE_PLANTUML_JAR_PATH: jarPath,
    ...overrides,
  };
}

function assertCliError(error, code, field) {
  assert.equal(error instanceof CliError, true);
  assert.equal(error.code, code);
  assert.equal(error.field, field);
  return true;
}

test('publishes immutable stable exit codes and safe optional error metadata', () => {
  assert.deepEqual(cliExitCodes, {
    success: 0,
    diagramFailure: 1,
    invocationFailure: 2,
  });
  assert.equal(Object.isFrozen(cliExitCodes), true);

  const plain = new CliError('plain', 'safe');
  assert.equal(plain.name, 'CliError');
  assert.equal(plain.code, 'plain');
  assert.equal('field' in plain, false);
  assert.equal('relativePath' in plain, false);

  const detailed = new CliError('detailed', 'safe', {
    field: 'input',
    relativePath: 'diagram.puml',
  });
  assert.equal(detailed.field, 'input');
  assert.equal(detailed.relativePath, 'diagram.puml');
});

test('parses validate with environment renderer paths', () => {
  const command = parseCliArguments(['validate', 'architecture.puml'], environment());
  assert.deepEqual(command, {
    kind: 'validate',
    inputPath: 'architecture.puml',
    outputPath: null,
    javaPath,
    jarPath,
    format: 'svg',
    overwrite: false,
    json: false,
    help: false,
  });
  assert.equal(Object.isFrozen(command), true);
});

test('parses render options and command-line renderer paths take precedence', () => {
  const explicitJava = process.platform === 'win32' ? 'D:\\Runtime\\java.exe' : '/srv/java';
  const explicitJar = process.platform === 'win32' ? 'D:\\Runtime\\plantuml.jar' : '/srv/plantuml.jar';
  const command = parseCliArguments([
    'render',
    'architecture.plantuml',
    '--output',
    'artifacts/architecture.png',
    '--java',
    explicitJava,
    '--jar',
    explicitJar,
    '--format',
    'png',
    '--overwrite',
    '--json',
  ], environment({
    DIAGRAMWEAVE_JAVA_PATH: 'relative-java',
    DIAGRAMWEAVE_PLANTUML_JAR_PATH: 'relative-jar',
  }));
  assert.deepEqual(command, {
    kind: 'render',
    inputPath: 'architecture.plantuml',
    outputPath: 'artifacts/architecture.png',
    javaPath: explicitJava,
    jarPath: explicitJar,
    format: 'png',
    overwrite: true,
    json: true,
    help: false,
  });
});

test('parses global and command help without renderer configuration', () => {
  for (const argv of [['--help'], ['-h'], ['help']]) {
    assert.deepEqual(parseCliArguments(argv, null), {
      kind: 'help',
      topic: null,
      inputPath: null,
      outputPath: null,
      javaPath: null,
      jarPath: null,
      format: null,
      overwrite: false,
      json: false,
      help: true,
    });
  }
  for (const [kind, flag] of [['validate', '--help'], ['render', '-h']]) {
    assert.equal(parseCliArguments([kind, flag], []).topic, kind);
  }
});

test('rejects non-array argv, non-string arguments, empty arguments, and controls', () => {
  assert.throws(
    () => parseCliArguments('validate', environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', 'argv'),
  );
  assert.throws(
    () => parseCliArguments(['validate', 42], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', 'argument'),
  );
  assert.throws(
    () => parseCliArguments(['validate', ''], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', 'argument'),
  );
  assert.throws(
    () => parseCliArguments(['validate', 'bad\npath'], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', 'argument'),
  );
});

test('rejects missing and unknown commands', () => {
  assert.throws(
    () => parseCliArguments([], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', 'command'),
  );
  assert.throws(
    () => parseCliArguments(['compile', 'x.puml'], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', 'command'),
  );
});

test('rejects non-plain environment records', () => {
  for (const value of [null, [], new Date()]) {
    assert.throws(
      () => parseCliArguments(['validate', 'x.puml'], value),
      (error) => assertCliError(error, 'invalid_cli_environment', 'environment'),
    );
  }
  const nullPrototype = Object.create(null);
  nullPrototype.DIAGRAMWEAVE_JAVA_PATH = javaPath;
  nullPrototype.DIAGRAMWEAVE_PLANTUML_JAR_PATH = jarPath;
  assert.equal(parseCliArguments(['validate', 'x.puml'], nullPrototype).kind, 'validate');
});

test('rejects unknown, repeated, and missing-value options', () => {
  assert.throws(
    () => parseCliArguments(['validate', 'x.puml', '--unknown'], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', '--unknown'),
  );
  assert.throws(
    () => parseCliArguments(['render', 'x.puml', '--output', 'x.svg', '--json', '--json'], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', '--json'),
  );
  assert.throws(
    () => parseCliArguments(['render', 'x.puml', '--output'], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', '--output'),
  );
  assert.throws(
    () => parseCliArguments(['render', 'x.puml', '--output', '--json'], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', '--output'),
  );
});

test('rejects missing and extra positional inputs', () => {
  assert.throws(
    () => parseCliArguments(['validate', '--json'], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', 'input'),
  );
  assert.throws(
    () => parseCliArguments(['validate', 'one.puml', 'two.puml'], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', 'input'),
  );
});

test('rejects missing, malformed, controlled, and relative environment paths', () => {
  const missingJava = environment();
  delete missingJava.DIAGRAMWEAVE_JAVA_PATH;
  assert.throws(
    () => parseCliArguments(['validate', 'x.puml'], missingJava),
    (error) => assertCliError(error, 'invalid_cli_environment', 'javaPath'),
  );

  assert.throws(
    () => parseCliArguments(['validate', 'x.puml'], environment({
      DIAGRAMWEAVE_PLANTUML_JAR_PATH: 12,
    })),
    (error) => assertCliError(error, 'invalid_cli_environment', 'jarPath'),
  );
  assert.throws(
    () => parseCliArguments(['validate', 'x.puml'], environment({
      DIAGRAMWEAVE_JAVA_PATH: 'bad\tjava',
    })),
    (error) => assertCliError(error, 'invalid_cli_environment', 'javaPath'),
  );
  assert.throws(
    () => parseCliArguments(['validate', 'x.puml'], environment({
      DIAGRAMWEAVE_PLANTUML_JAR_PATH: 'relative.jar',
    })),
    (error) => assertCliError(error, 'invalid_cli_environment', 'jarPath'),
  );
});

test('rejects relative explicit renderer paths and unsupported formats', () => {
  assert.throws(
    () => parseCliArguments(['validate', 'x.puml', '--java', 'java'], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', 'javaPath'),
  );
  assert.throws(
    () => parseCliArguments([
      'render', 'x.puml', '--output', 'x.pdf', '--format', 'pdf',
    ], environment()),
    (error) => assertCliError(error, 'invalid_cli_arguments', 'format'),
  );
});

test('enforces command-specific render options', () => {
  for (const suffix of [
    ['--output', 'x.svg'],
    ['--format', 'png'],
    ['--overwrite'],
  ]) {
    assert.throws(
      () => parseCliArguments(['validate', 'x.puml', ...suffix], environment()),
      (error) => assertCliError(error, 'invalid_cli_arguments', 'command'),
    );
  }
  assert.throws(
    () => parseCliArguments(['render', 'x.puml'], environment()),
    (error) => assertCliError(error, 'output_required', 'output'),
  );
});
