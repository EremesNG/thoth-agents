import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createOpenCodeInitCommand } from './opencode-init-command';

describe('OpenCode thoth-init command', () => {
  test('translates /thoth-init into the harness-neutral .thoth initializer', () => {
    const command = createOpenCodeInitCommand({
      projectRoot: join('C:', 'work', 'example'),
      packageRoot: process.cwd(),
    });

    expect(command).toMatchObject({
      description: 'Initialize thoth-agents project workflow governance',
      agent: 'orchestrator',
      subtask: false,
    });
    expect(command.template).toContain('thoth-init');
    expect(command.template).toContain('skills');
    expect(command.template).toContain('scripts');
    expect(command.template).toContain('init.mjs');
    expect(command.template).toContain('--project');
    expect(command.template).toContain('--json');
    expect(command.template).not.toContain('--harness');
    expect(command.template).toContain(join('C:', 'work', 'example'));
    expect(command.template).toContain('offline');
    expect(command.template).toContain('.thoth/');
    expect(command.template).toContain('thoth-work');
    expect(command.template).not.toContain('OpenSpec');
    expect(command.template).not.toContain('download\nskills');
  });
});
