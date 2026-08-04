import assert from 'node:assert/strict';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  discoverDiagramInputs,
  planRenderOutputs,
  publishArtifact,
} from '../src/files.js';
import { CliError } from '../src/errors.js';

function adapter(cwd, overrides = {}) {
  return {
    cwd: () => cwd,
    lstat,
    readdir,
    mkdir,
    open,
    rename,
    unlink,
    randomId: () => 'test-id',
    ...overrides,
  };
}

async function withTempDirectory(callback) {
  const root = await mkdtemp(join(tmpdir(), 'diagramweave-cli-'));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function assertCliError(error, code) {
  assert.equal(error instanceof CliError, true);
  assert.equal(error.code, code);
  return true;
}

function metadata(kind) {
  return {
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'directory',
    isSymbolicLink: () => kind === 'symlink',
  };
}

test('discovers one supported file with a frozen portable record', async () => {
  await withTempDirectory(async (root) => {
    await writeFile(join(root, 'Architecture.PUML'), '@startuml\n@enduml\n');
    const result = await discoverDiagramInputs('Architecture.PUML', adapter(root));
    assert.equal(result.inputKind, 'file');
    assert.equal(result.rootPath, join(root, 'Architecture.PUML'));
    assert.deepEqual(result.inputs.map(({ relativePath, sourceExtension }) => ({
      relativePath,
      sourceExtension,
    })), [{ relativePath: 'Architecture.PUML', sourceExtension: '.puml' }]);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.inputs), true);
    assert.equal(Object.isFrozen(result.inputs[0]), true);
  });
});

test('discovers nested diagrams iteratively in lexical portable order', async () => {
  await withTempDirectory(async (root) => {
    let current = root;
    for (let index = 0; index < 40; index += 1) {
      current = join(current, `d${String(index).padStart(2, '0')}`);
      await mkdir(current);
    }
    await writeFile(join(root, 'z.plantuml'), 'z');
    await writeFile(join(root, 'ignored.txt'), 'ignored');
    await writeFile(join(root, 'A.puml'), 'a');
    await writeFile(join(current, 'deep.puml'), 'deep');

    const result = await discoverDiagramInputs('.', adapter(root));
    assert.equal(result.inputKind, 'directory');
    assert.deepEqual(result.inputs.map((input) => input.relativePath), [
      'A.puml',
      `${Array.from({ length: 40 }, (_, index) => `d${String(index).padStart(2, '0')}`).join('/')}/deep.puml`,
      'z.plantuml',
    ]);
  });
});

test('rejects missing, unsupported, empty, and non-regular direct inputs', async () => {
  await withTempDirectory(async (root) => {
    await writeFile(join(root, 'notes.txt'), 'notes');
    await mkdir(join(root, 'empty'));
    await assert.rejects(
      discoverDiagramInputs('missing.puml', adapter(root)),
      (error) => assertCliError(error, 'input_not_found'),
    );
    await assert.rejects(
      discoverDiagramInputs('notes.txt', adapter(root)),
      (error) => assertCliError(error, 'input_not_supported'),
    );
    await assert.rejects(
      discoverDiagramInputs('empty', adapter(root)),
      (error) => assertCliError(error, 'input_empty'),
    );

    const fake = adapter(root, {
      lstat: async () => metadata('other'),
    });
    await assert.rejects(
      discoverDiagramInputs('device', fake),
      (error) => assertCliError(error, 'input_not_supported'),
    );
  });
});

test('rejects symlinked input paths, nested symlinks, and ancestor symlinks', async () => {
  await withTempDirectory(async (root) => {
    await writeFile(join(root, 'real.puml'), 'real');
    await symlink(join(root, 'real.puml'), join(root, 'link.puml'));
    await assert.rejects(
      discoverDiagramInputs('link.puml', adapter(root)),
      (error) => assertCliError(error, 'input_symlink_rejected'),
    );

    await mkdir(join(root, 'workspace'));
    await symlink(join(root, 'real.puml'), join(root, 'workspace', 'nested.puml'));
    await assert.rejects(
      discoverDiagramInputs('workspace', adapter(root)),
      (error) => assertCliError(error, 'input_symlink_rejected'),
    );

    await mkdir(join(root, 'real-dir'));
    await writeFile(join(root, 'real-dir', 'inside.puml'), 'inside');
    await symlink(join(root, 'real-dir'), join(root, 'linked-dir'));
    await assert.rejects(
      discoverDiagramInputs(join('linked-dir', 'inside.puml'), adapter(root)),
      (error) => assertCliError(error, 'input_symlink_rejected'),
    );
  });
});

test('rejects duplicate identities, directory non-files, escapes, and discovery races', async () => {
  await withTempDirectory(async (root) => {
    await writeFile(join(root, 'A.puml'), 'A');
    await writeFile(join(root, 'a.puml'), 'a');
    await assert.rejects(
      discoverDiagramInputs('.', adapter(root)),
      (error) => assertCliError(error, 'input_not_supported'),
    );

    const fakeRoot = metadata('directory');
    const fake = adapter(root, {
      lstat: async (path) => {
        if (path === root || path.endsWith('workspace')) {
          return fakeRoot;
        }
        if (path.endsWith('escape.puml')) {
          return metadata('file');
        }
        return null;
      },
      readdir: async () => [{ name: '../escape.puml' }],
    });
    await assert.rejects(
      discoverDiagramInputs('workspace', fake),
      (error) => assertCliError(error, 'input_not_supported'),
    );

    const changing = adapter(root, {
      lstat: async (path) => {
        if (path === root) {
          return fakeRoot;
        }
        throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      },
      readdir: async () => [{ name: 'gone.puml' }],
    });
    await assert.rejects(
      discoverDiagramInputs('.', changing),
      (error) => assertCliError(error, 'input_read_failed'),
    );

    const nonregular = adapter(root, {
      lstat: async (path) => path === root ? fakeRoot : metadata('other'),
      readdir: async () => [{ name: 'socket' }],
    });
    await assert.rejects(
      discoverDiagramInputs('.', nonregular),
      (error) => assertCliError(error, 'input_not_supported'),
    );
  });
});

test('maps filesystem metadata and directory read failures to safe errors', async () => {
  const cwd = '/virtual';
  const metadataFailure = adapter(cwd, {
    lstat: async () => {
      throw new Error('private path');
    },
  });
  await assert.rejects(
    discoverDiagramInputs('x.puml', metadataFailure),
    (error) => assertCliError(error, 'input_read_failed'),
  );

  const directoryReadFailure = adapter(cwd, {
    lstat: async () => metadata('directory'),
    readdir: async () => {
      throw new Error('private path');
    },
  });
  await assert.rejects(
    discoverDiagramInputs('workspace', directoryReadFailure),
    (error) => assertCliError(error, 'input_read_failed'),
  );
});

test('plans a single-file destination and permits explicit regular-file overwrite', async () => {
  await withTempDirectory(async (root) => {
    const source = join(root, 'diagram.puml');
    const output = join(root, 'diagram.svg');
    await writeFile(source, 'source');
    const discovery = await discoverDiagramInputs('diagram.puml', adapter(root));

    const fresh = await planRenderOutputs(
      discovery.inputs,
      'file',
      'diagram.svg',
      'svg',
      false,
      adapter(root),
    );
    assert.equal(fresh.destinations[0].absolutePath, output);
    assert.equal(fresh.destinations[0].outputPath, 'diagram.svg');
    assert.equal(Object.isFrozen(fresh.destinations[0]), true);

    await writeFile(output, 'old');
    const replacement = await planRenderOutputs(
      discovery.inputs,
      'file',
      'diagram.svg',
      'svg',
      true,
      adapter(root),
    );
    assert.equal(replacement.destinations.length, 1);
  });
});

test('rejects invalid single-file output plans', async () => {
  await withTempDirectory(async (root) => {
    const source = join(root, 'diagram.puml');
    await writeFile(source, 'source');
    const input = {
      absolutePath: source,
      relativePath: 'diagram.puml',
      sourceExtension: '.puml',
    };

    await assert.rejects(
      planRenderOutputs({}, 'file', 'diagram.svg', 'svg', false, adapter(root)),
      (error) => assertCliError(error, 'invalid_cli_arguments'),
    );
    await assert.rejects(
      planRenderOutputs([input, input], 'file', 'diagram.svg', 'svg', false, adapter(root)),
      (error) => assertCliError(error, 'output_collision'),
    );
    await assert.rejects(
      planRenderOutputs([input], 'file', 'diagram.png', 'svg', false, adapter(root)),
      (error) => assertCliError(error, 'output_collision'),
    );
    await assert.rejects(
      planRenderOutputs([input], 'file', 'diagram.puml', 'puml', true, adapter(root)),
      (error) => assertCliError(error, 'output_collision'),
    );

    await writeFile(join(root, 'diagram.svg'), 'old');
    await assert.rejects(
      planRenderOutputs([input], 'file', 'diagram.svg', 'svg', false, adapter(root)),
      (error) => assertCliError(error, 'output_exists'),
    );
    await mkdir(join(root, 'output.svg'));
    await assert.rejects(
      planRenderOutputs([input], 'file', 'output.svg', 'svg', true, adapter(root)),
      (error) => assertCliError(error, 'output_exists'),
    );
  });
});

test('plans directory outputs with preserved relative paths and detects collisions', async () => {
  await withTempDirectory(async (root) => {
    await mkdir(join(root, 'workspace', 'nested'), { recursive: true });
    await writeFile(join(root, 'workspace', 'a.puml'), 'a');
    await writeFile(join(root, 'workspace', 'nested', 'b.plantuml'), 'b');
    const discovery = await discoverDiagramInputs('workspace', adapter(root));
    const plan = await planRenderOutputs(
      discovery.inputs,
      'directory',
      'artifacts',
      'png',
      false,
      adapter(root),
    );
    assert.deepEqual(plan.destinations.map((destination) => destination.outputPath), [
      'a.png',
      'nested/b.png',
    ]);

    await mkdir(join(root, 'existing-artifacts'));
    const existingDirectory = await planRenderOutputs(
      discovery.inputs,
      'directory',
      'existing-artifacts',
      'svg',
      false,
      adapter(root),
    );
    assert.equal(existingDirectory.destinations.length, 2);

    const collisionInputs = [
      { absolutePath: join(root, 'one.puml'), relativePath: 'same.puml', sourceExtension: '.puml' },
      { absolutePath: join(root, 'two.plantuml'), relativePath: 'same.plantuml', sourceExtension: '.plantuml' },
    ];
    await assert.rejects(
      planRenderOutputs(collisionInputs, 'directory', 'out', 'svg', false, adapter(root)),
      (error) => assertCliError(error, 'output_collision'),
    );
  });
});

test('rejects escaped, source-colliding, existing, and non-directory batch outputs', async () => {
  await withTempDirectory(async (root) => {
    const escaped = [{
      absolutePath: join(root, 'source.puml'),
      relativePath: '../escape.puml',
      sourceExtension: '.puml',
    }];
    await assert.rejects(
      planRenderOutputs(escaped, 'directory', 'out', 'svg', false, adapter(root)),
      (error) => assertCliError(error, 'output_collision'),
    );

    const sourceCollisionPath = join(root, 'out', 'same.svg');
    const sourceCollision = [{
      absolutePath: sourceCollisionPath,
      relativePath: 'same.puml',
      sourceExtension: '.puml',
    }];
    await assert.rejects(
      planRenderOutputs(sourceCollision, 'directory', 'out', 'svg', false, adapter(root)),
      (error) => assertCliError(error, 'output_collision'),
    );

    await writeFile(join(root, 'not-a-directory'), 'file');
    await assert.rejects(
      planRenderOutputs(escaped.map((input) => ({ ...input, relativePath: 'safe.puml' })), 'directory', 'not-a-directory', 'svg', true, adapter(root)),
      (error) => assertCliError(error, 'output_exists'),
    );

    await mkdir(join(root, 'artifacts'));
    await writeFile(join(root, 'artifacts', 'safe.svg'), 'old');
    const safeInput = [{
      absolutePath: join(root, 'safe.puml'),
      relativePath: 'safe.puml',
      sourceExtension: '.puml',
    }];
    await assert.rejects(
      planRenderOutputs(safeInput, 'directory', 'artifacts', 'svg', false, adapter(root)),
      (error) => assertCliError(error, 'output_exists'),
    );
    const overwritePlan = await planRenderOutputs(
      safeInput,
      'directory',
      'artifacts',
      'svg',
      true,
      adapter(root),
    );
    assert.equal(overwritePlan.destinations.length, 1);
  });
});

test('rejects output symlinks and maps output metadata failures', async () => {
  await withTempDirectory(async (root) => {
    const input = [{
      absolutePath: join(root, 'source.puml'),
      relativePath: 'source.puml',
      sourceExtension: '.puml',
    }];
    await writeFile(input[0].absolutePath, 'source');
    await writeFile(join(root, 'real.svg'), 'real');
    await symlink(join(root, 'real.svg'), join(root, 'link.svg'));
    await assert.rejects(
      planRenderOutputs(input, 'file', 'link.svg', 'svg', true, adapter(root)),
      (error) => assertCliError(error, 'output_symlink_rejected'),
    );

    await mkdir(join(root, 'real-output'));
    await symlink(join(root, 'real-output'), join(root, 'linked-output'));
    await assert.rejects(
      planRenderOutputs(input, 'directory', 'linked-output', 'svg', true, adapter(root)),
      (error) => assertCliError(error, 'output_symlink_rejected'),
    );
  });

  const failing = adapter('/virtual', {
    lstat: async () => {
      throw new Error('secret');
    },
  });
  await assert.rejects(
    planRenderOutputs([{ absolutePath: '/virtual/a.puml', relativePath: 'a.puml', sourceExtension: '.puml' }], 'file', 'a.svg', 'svg', false, failing),
    (error) => assertCliError(error, 'output_write_failed'),
  );
});

test('publishes new artifacts exclusively and atomically overwrites existing files', async () => {
  await withTempDirectory(async (root) => {
    const destination = { absolutePath: join(root, 'nested', 'diagram.svg') };
    const receipt = await publishArtifact(
      destination,
      Buffer.from('new'),
      false,
      adapter(root),
    );
    assert.deepEqual(receipt, {
      absolutePath: destination.absolutePath,
      byteLength: 3,
    });
    assert.equal(Object.isFrozen(receipt), true);
    assert.equal(await readFile(destination.absolutePath, 'utf8'), 'new');

    await assert.rejects(
      publishArtifact(destination, Buffer.from('race'), false, adapter(root)),
      (error) => assertCliError(error, 'output_exists'),
    );
    assert.equal(await readFile(destination.absolutePath, 'utf8'), 'new');

    const replacement = await publishArtifact(
      destination,
      Buffer.from('replacement'),
      true,
      adapter(root),
    );
    assert.equal(replacement.byteLength, 11);
    assert.equal(await readFile(destination.absolutePath, 'utf8'), 'replacement');
    assert.deepEqual((await readdir(join(root, 'nested'))).sort(), ['diagram.svg']);
  });
});

test('uses a random UUID fallback for atomic replacement and ignores post-rename cleanup errors', async () => {
  await withTempDirectory(async (root) => {
    const destination = { absolutePath: join(root, 'diagram.svg') };
    await writeFile(destination.absolutePath, 'old');
    let renamed = false;
    const fileSystem = adapter(root, {
      randomId: undefined,
      rename: async (from, to) => {
        await rename(from, to);
        renamed = true;
      },
      unlink: async (path) => {
        if (renamed && path.includes('.tmp-')) {
          throw Object.assign(new Error('cleanup denied'), { code: 'EACCES' });
        }
        return unlink(path);
      },
    });
    const receipt = await publishArtifact(destination, Buffer.from('new'), true, fileSystem);
    assert.equal(receipt.byteLength, 3);
    assert.equal(await readFile(destination.absolutePath, 'utf8'), 'new');
  });
});

test('rejects invalid publication inputs, mkdir failures, and output symlinks', async () => {
  await assert.rejects(
    publishArtifact(null, Buffer.from('x'), false, adapter('/virtual')),
    (error) => assertCliError(error, 'output_write_failed'),
  );
  await assert.rejects(
    publishArtifact({ absolutePath: '/virtual/x.svg' }, 'not-bytes', false, adapter('/virtual')),
    (error) => assertCliError(error, 'output_write_failed'),
  );
  await assert.rejects(
    publishArtifact(
      { absolutePath: '/virtual/x.svg' },
      Buffer.from('x'),
      false,
      adapter('/virtual', { mkdir: async () => { throw new Error('denied'); } }),
    ),
    (error) => assertCliError(error, 'output_write_failed'),
  );

  await withTempDirectory(async (root) => {
    await writeFile(join(root, 'real.svg'), 'real');
    await symlink(join(root, 'real.svg'), join(root, 'link.svg'));
    await assert.rejects(
      publishArtifact(
        { absolutePath: join(root, 'link.svg') },
        Buffer.from('x'),
        true,
        adapter(root),
      ),
      (error) => assertCliError(error, 'output_symlink_rejected'),
    );
  });
});

test('cleans partial new files while preserving the original safe publication error', async () => {
  let closeCalls = 0;
  let unlinkCalls = 0;
  const handle = {
    async writeFile() {
      throw new Error('secret write failure');
    },
    async sync() {},
    async close() {
      closeCalls += 1;
      throw new Error('secret close failure');
    },
  };
  const fileSystem = adapter('/virtual', {
    lstat: async () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    mkdir: async () => {},
    open: async () => handle,
    unlink: async () => {
      unlinkCalls += 1;
      throw new Error('secret unlink failure');
    },
  });
  await assert.rejects(
    publishArtifact({ absolutePath: '/virtual/out.svg' }, Buffer.from('x'), false, fileSystem),
    (error) => assertCliError(error, 'output_write_failed'),
  );
  assert.equal(closeCalls, 1);
  assert.equal(unlinkCalls, 1);
});

test('maps atomic replacement failures and closes an open temporary handle', async () => {
  let closeCalls = 0;
  let unlinkCalls = 0;
  const handle = {
    async writeFile() {
      throw new Error('secret');
    },
    async sync() {},
    async close() {
      closeCalls += 1;
      throw new Error('close secret');
    },
  };
  const fileSystem = adapter('/virtual', {
    lstat: async () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    mkdir: async () => {},
    open: async () => handle,
    unlink: async () => {
      unlinkCalls += 1;
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
  });
  await assert.rejects(
    publishArtifact({ absolutePath: '/virtual/out.svg' }, Buffer.from('x'), true, fileSystem),
    (error) => assertCliError(error, 'output_write_failed'),
  );
  assert.equal(closeCalls, 1);
  assert.equal(unlinkCalls, 1);
});

test('completes successful cleanup operations after a failed exclusive write', async () => {
  let closeCalls = 0;
  let unlinkCalls = 0;
  const handle = {
    async writeFile() {
      throw new Error('write failed');
    },
    async sync() {},
    async close() {
      closeCalls += 1;
    },
  };
  const fileSystem = adapter('/virtual', {
    lstat: async () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    mkdir: async () => {},
    open: async () => handle,
    unlink: async () => {
      unlinkCalls += 1;
    },
  });
  await assert.rejects(
    publishArtifact({ absolutePath: '/virtual/out.svg' }, Buffer.from('x'), false, fileSystem),
    (error) => assertCliError(error, 'output_write_failed'),
  );
  assert.equal(closeCalls, 1);
  assert.equal(unlinkCalls, 1);
});

test('successfully closes and removes a temporary file after atomic write failure', async () => {
  let closeCalls = 0;
  let unlinkCalls = 0;
  const handle = {
    async writeFile() {
      throw new Error('write failed');
    },
    async sync() {},
    async close() {
      closeCalls += 1;
    },
  };
  const fileSystem = adapter('/virtual', {
    lstat: async () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    mkdir: async () => {},
    open: async () => handle,
    unlink: async () => {
      unlinkCalls += 1;
    },
  });
  await assert.rejects(
    publishArtifact({ absolutePath: '/virtual/out.svg' }, Buffer.from('x'), true, fileSystem),
    (error) => assertCliError(error, 'output_write_failed'),
  );
  assert.equal(closeCalls, 1);
  assert.equal(unlinkCalls, 1);
});
