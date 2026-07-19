import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createOpenCodeInitCommand } from './opencode-init-command';

describe('OpenCode thoth-init command', () => {
  test('translates /thoth-init into the bundled offline skill', () => {
    const command = createOpenCodeInitCommand({
      projectRoot: join('C:', 'work', 'example'),
      packageRoot: process.cwd(),
    });

    expect(command).toMatchObject({
      description: 'Initialize thoth-agents project SDD governance',
      agent: 'orchestrator',
      subtask: false,
    });
    expect(command.template).toContain('thoth-init');
    expect(command.template).toContain('skills');
    expect(command.template).toContain('scripts');
    expect(command.template).toContain('init.mjs');
    expect(command.template).toContain('--harness opencode');
    expect(command.template).toContain(join('C:', 'work', 'example'));
    expect(command.template).toContain('offline');
  });
});
