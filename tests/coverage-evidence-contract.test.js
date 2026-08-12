import assert from "node:assert/strict";
import test from "node:test";

import {
  COVERAGE_ARGS,
  parseCoverageSummary,
} from "../scripts/run-coverage.mjs";

test("converts Node built-in totals into standard coverage evidence", () => {
  const output = `
ℹ start of coverage report
ℹ -------------------------------------------------------------------------------
ℹ file                  | line % | branch % | funcs % | uncovered lines
ℹ -------------------------------------------------------------------------------
All files       |   91.11 |    82.22 |   73.33 |   64.44 |
ℹ -------------------------------------------------------------------------------
ℹ end of coverage report
`;

  assert.deepEqual(parseCoverageSummary(output), {
    total: {
      lines: { pct: 64.44 },
      statements: { pct: 91.11 },
      functions: { pct: 73.33 },
      branches: { pct: 82.22 },
    },
  });
});

test("refuses to synthesize evidence when Node reports no total row", () => {
  assert.throws(
    () => parseCoverageSummary("no coverage table"),
    /coverage total row was not found/,
  );
});

test("emits summary and changed-line coverage evidence", () => {
  assert.ok(COVERAGE_ARGS.includes("--reporter=json-summary"));
  assert.ok(COVERAGE_ARGS.includes("--reporter=json"));
  assert.ok(COVERAGE_ARGS.includes("--check-coverage"));
  assert.ok(COVERAGE_ARGS.includes("--lines=100"));
  assert.ok(COVERAGE_ARGS.includes("--branches=100"));
  assert.ok(COVERAGE_ARGS.includes("--functions=100"));
  assert.ok(COVERAGE_ARGS.includes("--statements=100"));
});
