"""Apply the one-shot Task 2 proposal-artifact hardening.

This helper exists only on the isolated security branch. The verification
workflow removes it before creating the durable green commit.
"""

from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    """Replace one reviewed source fragment or fail closed."""

    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


path = Path("scripts/hourly-proposal-bundle.mjs")
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    """    if (index === pathParts.length - 1 && !pathStat.isFile()) {
      fail(prefix, 'non_regular_file');
    }
""",
    """    if (index === pathParts.length - 1) {
      if (!pathStat.isFile()) {
        fail(prefix, 'non_regular_file');
      }
      if (pathStat.nlink !== 1) {
        fail(prefix, 'hard_link');
      }
    }
""",
    "regular-file hard-link guard",
)

text = replace_once(
    text,
    """  assertNoForbiddenLiteral(patch, forbiddenValues);

  await mkdir(outputDirectory, { mode: 0o700 });
""",
    """  if (patch.length > maximumSourceBytes) {
    fail('proposal_bundle_invalid', 'patch_size');
  }
  assertNoForbiddenLiteral(patch, forbiddenValues);

  await mkdir(outputDirectory, { mode: 0o700 });
""",
    "build patch budget",
)

text = replace_once(
    text,
    """  const {
    bundleDirectory,
    expectedBaseCommitSha,
    expectedExecutionMode,
    expectedRepositoryFullName,
  } = options;
  const topLevelEntries = await readdir(bundleDirectory, { withFileTypes: true });
""",
    """  const {
    bundleDirectory,
    expectedBaseCommitSha,
    expectedExecutionMode,
    expectedRepositoryFullName,
    forbiddenLiteralValues,
  } = options;
  const forbiddenValues = normalizeForbiddenValues(forbiddenLiteralValues);
  const bundleStat = await lstatOrNull(bundleDirectory);
  if (
    bundleStat === null ||
    bundleStat.isSymbolicLink() ||
    !bundleStat.isDirectory()
  ) {
    fail('proposal_bundle_invalid', 'bundle_directory');
  }
  const topLevelEntries = await readdir(bundleDirectory, { withFileTypes: true });
""",
    "bundle root guard",
)

text = replace_once(
    text,
    """  for (const requiredFile of ['proposal-manifest.json', 'proposal.patch']) {
    const directoryEntry = topLevelEntries.find((entry) => entry.name === requiredFile);
    if (!directoryEntry?.isFile() || directoryEntry.isSymbolicLink()) {
      fail('proposal_bundle_invalid', requiredFile);
    }
  }

  let parsedManifest;
  try {
    parsedManifest = JSON.parse(
      await readFile(join(bundleDirectory, 'proposal-manifest.json'), 'utf8'),
    );
  } catch {
    fail('proposal_bundle_invalid', 'manifest_json');
  }
  const manifest = validateProposalManifest(parsedManifest);
""",
    """  for (const requiredFile of ['proposal-manifest.json', 'proposal.patch']) {
    const directoryEntry = topLevelEntries.find((entry) => entry.name === requiredFile);
    if (!directoryEntry?.isFile() || directoryEntry.isSymbolicLink()) {
      fail('proposal_bundle_invalid', requiredFile);
    }
    const requiredStat = await lstat(join(bundleDirectory, requiredFile));
    if (requiredStat.nlink !== 1) {
      fail('proposal_bundle_invalid', 'hard_link');
    }
  }

  let manifestContent;
  let parsedManifest;
  try {
    manifestContent = await readFile(
      join(bundleDirectory, 'proposal-manifest.json'),
      'utf8',
    );
    parsedManifest = JSON.parse(manifestContent);
  } catch {
    fail('proposal_bundle_invalid', 'manifest_json');
  }
  const manifest = validateProposalManifest(parsedManifest);
  if (manifestContent !== canonicalJson(manifest)) {
    fail('proposal_bundle_invalid', 'manifest_canonical');
  }
  assertNoForbiddenLiteral(Buffer.from(manifestContent), forbiddenValues);
""",
    "canonical manifest guard",
)

text = replace_once(
    text,
    """  const patch = await readFile(join(bundleDirectory, 'proposal.patch'));
  if (sha256Hex(patch) !== manifest.patch_sha256) {
""",
    """  const patch = await readFile(join(bundleDirectory, 'proposal.patch'));
  if (patch.length > maximumSourceBytes) {
    fail('proposal_bundle_invalid', 'patch_size');
  }
  assertNoForbiddenLiteral(patch, forbiddenValues);
  if (sha256Hex(patch) !== manifest.patch_sha256) {
""",
    "validation patch budget",
)

text = replace_once(
    text,
    """    const snapshot = await readFile(snapshotPath);
    const observedMode = snapshotStat.mode & 0o111 ? '0755' : '0644';
""",
    """    const snapshot = await readFile(snapshotPath);
    assertNoForbiddenLiteral(snapshot, forbiddenValues);
    const observedMode = snapshotStat.mode & 0o111 ? '0755' : '0644';
""",
    "snapshot secret scan",
)

text = replace_once(
    text,
    """ * @param {'product'|'remediation'} options.expectedExecutionMode Expected mode.
 * @returns {Promise<Readonly<object>>} Deeply frozen validated manifest.
""",
    """ * @param {'product'|'remediation'} options.expectedExecutionMode Expected mode.
 * @param {(string|Buffer|Uint8Array)[]} [options.forbiddenLiteralValues]
 *   Sensitive byte sequences forbidden anywhere in the artifact payload.
 * @returns {Promise<Readonly<object>>} Deeply frozen validated manifest.
""",
    "validation JSDoc",
)

text = replace_once(
    text,
    """    expectedExecutionMode,
    expectedRepositoryFullName,
    targetWorkspacePath,
  } = options;
""",
    """    expectedExecutionMode,
    expectedRepositoryFullName,
    forbiddenLiteralValues,
    targetWorkspacePath,
  } = options;
""",
    "materialization forbidden-values option",
)

text = replace_once(
    text,
    """    expectedExecutionMode,
    expectedRepositoryFullName,
  });
""",
    """    expectedExecutionMode,
    expectedRepositoryFullName,
    forbiddenLiteralValues,
  });
""",
    "materialization validation forwarding",
)

text = replace_once(
    text,
    """ * @param {'product'|'remediation'} options.expectedExecutionMode Expected mode.
 * @returns {Promise<Readonly<object>>} Validated manifest.
""",
    """ * @param {'product'|'remediation'} options.expectedExecutionMode Expected mode.
 * @param {(string|Buffer|Uint8Array)[]} [options.forbiddenLiteralValues]
 *   Sensitive byte sequences forbidden anywhere in the artifact payload.
 * @returns {Promise<Readonly<object>>} Validated manifest.
""",
    "materialization JSDoc",
)

path.write_text(text, encoding="utf-8")
