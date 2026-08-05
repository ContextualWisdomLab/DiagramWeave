#!/usr/bin/env node

import { runLanguageServerStdioProcess } from '../src/index.js';

await runLanguageServerStdioProcess({
  input: process.stdin,
  output: process.stdout,
  stderr: process.stderr,
  environment: process.env,
  setExitCode(code) {
    process.exitCode = code;
  },
});
