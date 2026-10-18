import { describe, expect, it } from 'vitest';
import type { SubagentTask } from '../../src/types.js';
import { createSubagentsWorkPanelProvider } from '../../src/ui/work-panel-provider.js';

function rowFor(agent: string) {
  const task: SubagentTask = {
    id: 'task-a',
    status: 'running',
    agent,
    mode: 'task',
    task: 'review the plan',
    created_at: new Date(0).toISOString(),
  };
  const provider = createSubagentsWorkPanelProvider({
    listTasks: () => [task],
    onTaskUpdate: () => () => {},
    cancel: () => undefined,
    open: () => undefined as never,
  });
  return provider.listRows(Date.now())[0];
}

describe('subagent row compact names', () => {
  it('supplies the sidebar-only name without the thoth- prefix', () => {
    const row = rowFor('thoth-oracle');
    // Full name stays in the host-facing fields; compact text is columns-only data.
    expect(row.name).toBe('thoth-oracle');
    expect(row.identity?.[0]).toEqual({
      text: 'thoth-oracle',
      compact: 'oracle',
      role: 'primary',
    });
  });

  it.each([
    'worker',
    'thoth-',
    'my-thoth-agent',
  ])('adds no compact text for %s', (agent) => {
    expect(rowFor(agent).identity?.[0]).not.toHaveProperty('compact');
  });
});
