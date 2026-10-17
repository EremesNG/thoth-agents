import { describe, expect, it } from 'vitest';
import { buildDeveloperInstructions } from '../src/instructions.js';

describe('developer instructions', () => {
  it('sets autonomous delegation boundaries and conditional Computer Use routing', () => {
    const instructions = buildDeveloperInstructions();
    for (const required of [
      'Pi agent (another coding agent)',
      'self-contained task',
      'Do not ask the user questions',
      'plan/read-only mode',
      'do not attempt mutations',
      'including through MCP or GUI actions',
      'files changed',
      'commands run',
      'anything not verified',
      'Only when the task requires',
      'cua_repl',
      'cua.getState()',
      'Edge/Chrome',
      'Desktop is closed',
      'node_repl',
      "await import('@oai/sky')",
      'Codex Desktop running',
      'SKILL.md',
      'docs/guidance.md',
      'docs/api.md',
      'docs/confirmations.md',
      'node_repl fs',
      'not via shell',
      'globalThis',
      'const/let',
      're-list windows',
      'explicitly by id',
      'observe -> act -> observe',
      'fresh screenshot/window state',
      'accessibility state may be null',
      'was not approved',
      'report it and stop',
      'PowerShell/SendKeys',
      "other apps' documents or windows",
    ]) {
      expect(instructions, required).toContain(required);
    }
    expect(instructions.trim().split('\n').length).toBeGreaterThanOrEqual(25);
    expect(instructions.trim().split('\n').length).toBeLessThanOrEqual(45);
  });
});
