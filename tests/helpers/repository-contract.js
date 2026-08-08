import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function readRepositoryFile(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

export function workflowStep(workflow, name, nextName) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `${name} step must exist`);
  const nextMarker = `      - name: ${nextName}\n`;
  const end = workflow.indexOf(nextMarker, start + marker.length);
  assert.notEqual(end, -1, `${nextName} step must follow ${name}`);
  return workflow.slice(start, end);
}

export function finalWorkflowStep(workflow, name) {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `${name} step must exist`);
  return workflow.slice(start);
}
