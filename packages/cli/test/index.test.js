import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { runDiagramWeaveCli } from '../src/index.js';

const javaPath = process.platform === 'win32' ? 'C:\\Java\\java.exe' : '/opt/java';
const jarPath = process.platform === 'win32' ? 'C:\\PlantUML\\plantuml.jar' : '/opt/plantuml.jar';
const environment = {
  DIAGRAMWEAVE_JAVA_PATH: javaPath,
  DIAGRAMWEAVE_PLANTUML_JAR_PATH: jarPath,
};

test('runs global help with default options and no renderer configuration', async () => {
  const report = await runDiagramWeaveCli(['--help']);
  assert.equal(report.command, 'help');
  assert.equal(report.exitCode, 0);
});

test('returns a safe report for non-plain options and parser failures', async () => {
  for (const options of [null, [], new Date()]) {
    const report = await runDiagramWeaveCli(['--help'], options);
    assert.equal(report.errorCode, 'internal_cli_error');
    assert.equal(report.exitCode, 2);
  }
  const parserFailure = await runDiagramWeaveCli([], { environment });
  assert.equal(parserFailure.errorCode, 'invalid_cli_arguments');
  assert.equal(parserFailure.command, null);
});

test('accepts null-prototype options and injected runtime seams', async () => {
  const options = Object.create(null);
  options.environment = environment;
  options.fileSystem = { readFile: async () => Buffer.from('source') };
  options.rendererFactory = () => Object.freeze({
    async render() {
      return Object.freeze({
        format: 'svg',
        encoding: 'base64',
        dataBase64: Buffer.from('<svg/>').toString('base64'),
        byteLength: 6,
        sourceRevisionHash: 'hash',
      });
    },
  });
  options.discoverDiagramInputs = async () => Object.freeze({
    inputKind: 'file',
    rootPath: '/workspace/a.puml',
    inputs: Object.freeze([Object.freeze({
      absolutePath: '/workspace/a.puml',
      relativePath: 'a.puml',
      sourceExtension: '.puml',
    })]),
  });
  options.planRenderOutputs = async () => {
    throw new Error('not used');
  };
  options.publishArtifact = async () => {
    throw new Error('not used');
  };

  const report = await runDiagramWeaveCli(['validate', 'a.puml'], options);
  assert.equal(report.status, 'success');
  assert.equal(report.files[0].sourceRevisionHash, 'hash');
});

test('uses the production filesystem, process environment, and default renderer factory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'diagramweave-index-'));
  const previousJava = process.env.DIAGRAMWEAVE_JAVA_PATH;
  const previousJar = process.env.DIAGRAMWEAVE_PLANTUML_JAR_PATH;
  try {
    const sourcePath = join(root, 'diagram.puml');
    const executablePath = join(root, 'fake-java');
    const plantUmlPath = join(root, 'plantuml.jar');
    await writeFile(sourcePath, '@startuml\n@enduml\n');
    await writeFile(
      executablePath,
      "#!/bin/sh\nwhile IFS= read -r _line; do :; done\nprintf '<svg/>'\n",
    );
    await chmod(executablePath, 0o755);
    await writeFile(plantUmlPath, 'test fixture');
    process.env.DIAGRAMWEAVE_JAVA_PATH = executablePath;
    process.env.DIAGRAMWEAVE_PLANTUML_JAR_PATH = plantUmlPath;
    const report = await runDiagramWeaveCli(['validate', sourcePath]);
    assert.equal(report.status, 'success');
    assert.equal(report.files[0].relativePath, 'diagram.puml');
    assert.match(report.files[0].sourceRevisionHash, /^[a-f0-9]{64}$/u);
  } finally {
    if (previousJava === undefined) {
      delete process.env.DIAGRAMWEAVE_JAVA_PATH;
    } else {
      process.env.DIAGRAMWEAVE_JAVA_PATH = previousJava;
    }
    if (previousJar === undefined) {
      delete process.env.DIAGRAMWEAVE_PLANTUML_JAR_PATH;
    } else {
      process.env.DIAGRAMWEAVE_PLANTUML_JAR_PATH = previousJar;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('converts unexpected option getter failures after parsing into a safe report', async () => {
  const options = { environment };
  Object.defineProperty(options, 'fileSystem', {
    get() {
      throw new Error('private runtime failure');
    },
  });
  const report = await runDiagramWeaveCli(['validate', 'a.puml'], options);
  assert.equal(report.command, 'validate');
  assert.equal(report.errorCode, 'internal_cli_error');
  assert.equal(report.errorMessage.includes('private'), false);
});
