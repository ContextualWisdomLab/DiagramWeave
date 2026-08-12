import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const C8_BIN = require.resolve("c8/bin/c8.js");

export const COVERAGE_ARGS = [
  C8_BIN,
  "--all",
  "--include=packages/**/src/*.js",
  "--reporter=text",
  "--reporter=json",
  "--reporter=json-summary",
  "--check-coverage",
  "--lines=100",
  "--branches=100",
  "--functions=100",
  "--statements=100",
  process.execPath,
  "--test",
];

export function parseCoverageSummary(output) {
  const totalRow = output
    .split(/\r?\n/)
    .map((line) => line.match(/\ball files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i))
    .find(Boolean);

  if (!totalRow) {
    throw new Error("coverage total row was not found");
  }

  const [, statementPct, branchPct, functionPct, linePct] = totalRow;
  return {
    total: {
      lines: { pct: Number(linePct) },
      statements: { pct: Number(statementPct) },
      functions: { pct: Number(functionPct) },
      branches: { pct: Number(branchPct) },
    },
  };
}

export async function runCoverage() {
  const child = spawn(process.execPath, COVERAGE_ARGS, { stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCoverage();
}
