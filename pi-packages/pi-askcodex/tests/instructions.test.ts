import { describe, expect, it } from 'vitest';
import { buildDeveloperInstructions } from '../src/instructions.js';

describe('developer instructions', () => {
  it('sets autonomous delegation boundaries and defers Computer Use to the bundled skill', () => {
    const instructions = buildDeveloperInstructions();
    for (const required of [
      'You were delegated a self-contained task by a Pi agent (another coding agent).',
      'Work autonomously within the given task scope, sandbox, and mode.',
      'Do not ask the user questions: there is no interactive human in the loop beyond approvals.',
      'In plan/read-only mode, do not attempt mutations, including through MCP or GUI actions.',
      'Finish with a concise final answer reporting results, files changed, commands run,',
      'and anything not verified; do not claim success without evidence.',
      'When the task requires Computer Use, follow your bundled computer-use skill.',
      'App access approvals are handled by the host or the user; if access is denied, report it and stop.',
    ]) {
      expect(instructions, required).toContain(required);
    }
  });

  it('does not prescribe a Computer Use method', () => {
    const instructions = buildDeveloperInstructions();
    for (const method of [
      'node_repl',
      '@oai/sky',
      'cua_repl',
      'globalThis',
      'screenshot',
    ]) {
      expect(instructions, method).not.toContain(method);
    }
  });
});
