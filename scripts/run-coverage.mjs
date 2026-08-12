import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const COVERAGE_ARGS = [
  "--test",
  "--experimental-test-coverage",
  "--test-coverage-include=packages/**/src/*.js",
  "--test-coverage-lines=100",
  "--test-coverage-branches=100",
  "--test-coverage-functions=100",
];

export function parseCoverageSummary(output) {
  const totalRow = output
    .split(/\r?\n/)
    .map((line) => line.match(/\ball files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i))
    .find(Boolean);

  if (!totalRow) {
    throw new Error("coverage total row was not found");
  }

  const [, linePct, branchPct, functionPct] = totalRow;
  return {
    total: {
      lines: { pct: Number(linePct) },
      statements: { pct: Number(linePct) },
      functions: { pct: Number(functionPct) },
      branches: { pct: Number(branchPct) },
    },
  };
}

export async function runCoverage() {
  const child = spawn(process.execPath, COVERAGE_ARGS, {
    stdio: ["inherit", "pipe", "pipe"],
  });
  let output = "";

  child.stdout.on("data", (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.pipe(process.stderr);

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    return exitCode;
  }

  const summary = parseCoverageSummary(output);
  await mkdir("coverage", { recursive: true });
  await writeFile(
    "coverage/coverage-summary.json",
    JSON.stringify(summary, null, 2) + "\n",
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCoverage();
}
