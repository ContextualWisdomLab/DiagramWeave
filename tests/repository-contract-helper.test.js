import assert from "node:assert/strict";
import test from "node:test";

import { finalWorkflowStep } from "./helpers/repository-contract.js";

test("finalWorkflowStep rejects following workflow steps", () => {
  const workflow = `
jobs:
  example:
    steps:
      - name: Publish one bounded mutation
        run: echo publish
      - name: Unrelated later step
        run: git push --force
`;

  assert.throws(
    () => finalWorkflowStep(workflow, "Publish one bounded mutation"),
    /Publish one bounded mutation step must be final/,
  );
});

test("finalWorkflowStep rejects a missing requested step", () => {
  assert.throws(
    () => finalWorkflowStep("jobs: {}", "Publish one bounded mutation"),
    /step must exist/,
  );
});
