import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PHASE_REMINDER, PHASE_REMINDER_SEPARATOR } from '../phase-reminder';
import {
  buildCompactionReminder,
  buildMemoryInstructions,
  buildSaveNudge,
} from './protocol';

const {
  createThothClientMock,
  memContextMock,
  memSavePromptMock,
  memSessionStartMock,
} = vi.hoisted(() => {
  const memContextMock = vi.fn(async () => null as string | null);
  const memSessionStartMock = vi.fn(async () => true);
  const memSavePromptMock = vi.fn(async () => true);
  const createThothClientMock = vi.fn(() => ({
    enabled: true,
    memContext: memContextMock,
    memSessionStart: memSessionStartMock,
    memSavePrompt: memSavePromptMock,
  }));

  return {
    createThothClientMock,
    memContextMock,
    memSavePromptMock,
    memSessionStartMock,
  };
});

vi.mock('../../thoth', () => ({
  createThothClient: createThothClientMock,
}));

const { createThothMemHook } = await import('./index');

const MINUTE = 60 * 1000;
const realDateNow = Date.now;

function createMockEvent(
  type: string,
  info: { id: string; parentID?: string },
) {
  return {
    event: {
      type,
      properties: { info },
    } as never,
  };
}

function mockNow(now: number) {
  Date.now = () => now;
}

async function createRootSession(
  hook: ReturnType<typeof createThothMemHook>,
  sessionID = 'root-session',
) {
  await hook.event(createMockEvent('session.created', { id: sessionID }));
}

async function createChildSession(
  hook: ReturnType<typeof createThothMemHook>,
  sessionID = 'child-session',
  parentID = 'root-session',
) {
  await hook.event(
    createMockEvent('session.created', { id: sessionID, parentID }),
  );
}

async function compactSession(
  hook: ReturnType<typeof createThothMemHook>,
  sessionID = 'root-session',
) {
  await hook.event(createMockEvent('session.compacted', { id: sessionID }));
}

async function deleteSession(
  hook: ReturnType<typeof createThothMemHook>,
  sessionID = 'root-session',
) {
  await hook.event(createMockEvent('session.deleted', { id: sessionID }));
}

async function transformSystem(
  hook: ReturnType<typeof createThothMemHook>,
  sessionID = 'root-session',
  system = ['Base system prompt'],
) {
  const output = { system: [...system] };

  await hook['experimental.chat.system.transform']?.(
    { sessionID, model: {} as never },
    output,
  );

  return output;
}

async function runToolExecuteAfter(
  hook: ReturnType<typeof createThothMemHook>,
  tool: string,
  sessionID = 'root-session',
) {
  await hook['tool.execute.after']?.(
    {
      tool,
      sessionID,
      callID: 'call-1',
      args: {},
    },
    {
      title: 'Tool finished',
      output: 'ok',
      metadata: {},
    },
  );
}

describe('createThothMemHook', () => {
  beforeEach(() => {
    createThothClientMock.mockReset();
    createThothClientMock.mockImplementation(() => ({
      enabled: true,
      memContext: memContextMock,
      memSessionStart: memSessionStartMock,
      memSavePrompt: memSavePromptMock,
    }));

    memContextMock.mockReset();
    memSessionStartMock.mockReset();
    memSavePromptMock.mockReset();

    memContextMock.mockResolvedValue(null);
    memSessionStartMock.mockResolvedValue(true);
    memSavePromptMock.mockResolvedValue(true);
    Date.now = realDateNow;
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  test('creates the thoth client with HTTP settings', () => {
    createThothMemHook({
      project: 'thoth-agents',
      directory: '/workspace/thoth-agents',
      thoth: { timeout: 25000, http_port: 8123 },
      enabled: true,
    });

    expect(createThothClientMock).toHaveBeenCalledWith({
      project: 'thoth-agents',
      directory: '/workspace/thoth-agents',
      httpPort: 8123,
      timeoutMs: 25000,
      enabled: true,
    });
  });

  test('injects memory protocol guidance into tracked root session prompts', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);

    const output = await transformSystem(hook);

    const expectedInstructions = buildMemoryInstructions(
      'root-session',
      'thoth-agents',
    );
    expect(output.system[0]).toContain('Base system prompt');
    expect(output.system[0]).toContain(expectedInstructions);
  });

  test('injects compaction instructions and retrieved memory context during compaction', async () => {
    memContextMock.mockResolvedValue('## Memory Context\n- Prior decision');

    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);
    memSessionStartMock.mockClear();

    const output = { context: [] as string[] };
    await hook['experimental.session.compacting']?.(
      { sessionID: 'root-session' },
      output,
    );

    expect(memSessionStartMock).not.toHaveBeenCalled();
    expect(output.context[0]).toContain('CRITICAL INSTRUCTION');
    expect(output.context[0]).toContain("Use project: 'thoth-agents'.");
    expect(output.context).toContain('## Memory Context\n- Prior decision');
  });

  test('filters child sessions from root memory tracking', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createChildSession(hook);

    expect(memSessionStartMock).not.toHaveBeenCalled();
  });

  test('saves root prompts only after the root session is created', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);
    memSessionStartMock.mockClear();

    await hook['chat.message']?.(
      { sessionID: 'root-session' },
      {
        parts: [{ type: 'text', text: 'User prompt content' } as never],
        message: {},
      },
    );

    expect(memSessionStartMock).not.toHaveBeenCalled();
    expect(memSavePromptMock).toHaveBeenCalledWith(
      'root-session',
      'User prompt content',
    );
  });

  test('does not save child prompts or enroll child sessions from chat.message', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);
    await createChildSession(hook);
    memSessionStartMock.mockClear();

    await hook['chat.message']?.(
      { sessionID: 'child-session' },
      {
        parts: [
          {
            type: 'text',
            text: 'Generated subagent scaffolding prompt',
          } as never,
        ],
        message: {},
      },
    );

    expect(memSessionStartMock).not.toHaveBeenCalled();
    expect(memSavePromptMock).not.toHaveBeenCalled();
  });

  test('fails closed for unknown sessions in chat.message', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await hook['chat.message']?.(
      { sessionID: 'unknown-session' },
      {
        parts: [
          {
            type: 'text',
            text: 'Unknown session prompt should not be saved',
          } as never,
        ],
        message: {},
      },
    );

    expect(memSessionStartMock).not.toHaveBeenCalled();
    expect(memSavePromptMock).not.toHaveBeenCalled();
  });

  test('strips injected phase reminder before saving prompts', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);

    await hook['chat.message']?.(
      { sessionID: 'root-session' },
      {
        parts: [
          {
            type: 'text',
            text: `${PHASE_REMINDER}${PHASE_REMINDER_SEPARATOR}Real user request`,
          } as never,
        ],
        message: {},
      },
    );

    expect(memSavePromptMock).toHaveBeenCalledWith(
      'root-session',
      'Real user request',
    );
  });

  test('strips injected phase reminder before private tags and truncation', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);

    await hook['chat.message']?.(
      { sessionID: 'root-session' },
      {
        parts: [
          {
            type: 'text',
            text: `${PHASE_REMINDER}${PHASE_REMINDER_SEPARATOR}${'a'.repeat(1990)}<private>secret</private>`,
          } as never,
        ],
        message: {},
      },
    );

    expect(memSavePromptMock.mock.calls[0]?.[1]).toBe(
      `${'a'.repeat(1990)}[REDACTED]`,
    );
  });

  test('strips private tags before saving prompts', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);

    await hook['chat.message']?.(
      { sessionID: 'root-session' },
      {
        parts: [
          {
            type: 'text',
            text: 'Please keep <private>secret</private> hidden in memory.',
          } as never,
        ],
        message: {},
      },
    );

    expect(memSavePromptMock).toHaveBeenCalledWith(
      'root-session',
      'Please keep [REDACTED] hidden in memory.',
    );
  });

  test('truncates prompts longer than 2000 characters before saving', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);

    await hook['chat.message']?.(
      { sessionID: 'root-session' },
      {
        parts: [{ type: 'text', text: 'a'.repeat(2005) } as never],
        message: {},
      },
    );

    expect(memSavePromptMock).toHaveBeenCalledTimes(1);
    expect(memSavePromptMock.mock.calls[0]?.[1]).toBe(`${'a'.repeat(2000)}...`);
  });

  test('ignores chat.message events without text content', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);

    await hook['chat.message']?.(
      { sessionID: 'root-session' },
      {
        parts: [{ type: 'tool-call', tool: 'read' } as never],
        message: {},
      },
    );

    expect(memSavePromptMock).not.toHaveBeenCalled();
  });

  test('does not save prompts that sanitize to exactly 10 characters', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);

    await hook['chat.message']?.(
      { sessionID: 'root-session' },
      {
        parts: [{ type: 'text', text: '1234567890' } as never],
        message: {},
      },
    );

    expect(memSavePromptMock).not.toHaveBeenCalled();
  });

  test('saves prompts that sanitize to 11 characters', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);

    await hook['chat.message']?.(
      { sessionID: 'root-session' },
      {
        parts: [{ type: 'text', text: '12345678901' } as never],
        message: {},
      },
    );

    expect(memSavePromptMock).toHaveBeenCalledWith(
      'root-session',
      '12345678901',
    );
  });

  test('does not save prompts that become empty after trimming', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);

    await hook['chat.message']?.(
      { sessionID: 'root-session' },
      {
        parts: [{ type: 'text', text: '   \n  ' } as never],
        message: {},
      },
    );

    expect(memSavePromptMock).not.toHaveBeenCalled();
  });

  test('clears compaction follow-up flag when mem_session_summary tool is called', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);
    await compactSession(hook);

    const expectedInstructions = buildMemoryInstructions(
      'root-session',
      'thoth-agents',
    );

    const withReminder = await transformSystem(hook);

    expect(withReminder.system[0]).toContain(expectedInstructions);
    expect(withReminder.system[0]).toContain(
      buildCompactionReminder('root-session'),
    );

    await runToolExecuteAfter(
      hook,
      'mcp_thoth_mem_mem_session_summary',
      'root-session',
    );

    const withoutReminder = await transformSystem(hook);

    expect(withoutReminder.system[0]).toContain(expectedInstructions);
    expect(withoutReminder.system[0]).not.toContain(
      buildCompactionReminder('root-session'),
    );
  });

  test('does not inject a save nudge for young sessions', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    const start = 1_000_000;
    mockNow(start);
    await createRootSession(hook);

    mockNow(start + 4 * MINUTE);
    const output = await transformSystem(hook);

    expect(output.system[0]).not.toContain(buildSaveNudge());
  });

  test('does not inject a save nudge when memory was saved recently', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    const start = 2_000_000;
    mockNow(start);
    await createRootSession(hook);

    mockNow(start + 6 * MINUTE);
    await runToolExecuteAfter(hook, 'mem_save');

    mockNow(start + 10 * MINUTE);
    const output = await transformSystem(hook);

    expect(output.system[0]).not.toContain(buildSaveNudge());
  });

  test('injects a save nudge when the session is old enough and has no recent saves', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    const start = 3_000_000;
    mockNow(start);
    await createRootSession(hook);

    mockNow(start + 6 * MINUTE);
    const output = await transformSystem(hook);

    expect(output.system[0]).toContain(buildSaveNudge());
  });

  test('injects a save nudge only once until memory is saved', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    const start = 4_000_000;
    mockNow(start);
    await createRootSession(hook);

    mockNow(start + 6 * MINUTE);
    const firstOutput = await transformSystem(hook);

    mockNow(start + 7 * MINUTE);
    const secondOutput = await transformSystem(hook);

    expect(firstOutput.system[0]).toContain(buildSaveNudge());
    expect(secondOutput.system[0]).not.toContain(buildSaveNudge());
  });

  test('resets the save nudge cycle after mem_save and nudges again later', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    const start = 5_000_000;
    mockNow(start);
    await createRootSession(hook);

    mockNow(start + 6 * MINUTE);
    const firstOutput = await transformSystem(hook);

    mockNow(start + 7 * MINUTE);
    await runToolExecuteAfter(hook, 'mem_save');

    mockNow(start + 8 * MINUTE);
    const recentSaveOutput = await transformSystem(hook);

    mockNow(start + 23 * MINUTE);
    const laterOutput = await transformSystem(hook);

    expect(firstOutput.system[0]).toContain(buildSaveNudge());
    expect(recentSaveOutput.system[0]).not.toContain(buildSaveNudge());
    expect(laterOutput.system[0]).toContain(buildSaveNudge());
  });

  test('does not inject a save nudge during compaction follow-up', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    const start = 6_000_000;
    mockNow(start);
    await createRootSession(hook);
    await compactSession(hook);

    mockNow(start + 6 * MINUTE);
    const output = await transformSystem(hook);

    expect(output.system[0]).toContain(buildCompactionReminder('root-session'));
    expect(output.system[0]).not.toContain(buildSaveNudge());
  });

  test('cleans nudge state when a deleted session is recreated', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    const start = 7_000_000;
    mockNow(start);
    await createRootSession(hook);

    mockNow(start + 6 * MINUTE);
    const firstOutput = await transformSystem(hook);

    mockNow(start + 7 * MINUTE);
    await runToolExecuteAfter(hook, 'mem_save');
    await compactSession(hook);
    await deleteSession(hook);

    mockNow(start + 8 * MINUTE);
    await createRootSession(hook);

    mockNow(start + 14 * MINUTE);
    const recreatedOutput = await transformSystem(hook);

    expect(firstOutput.system[0]).toContain(buildSaveNudge());
    expect(recreatedOutput.system[0]).toContain(buildSaveNudge());
    expect(recreatedOutput.system[0]).not.toContain(
      buildCompactionReminder('root-session'),
    );
  });

  test('resets session age when a deleted session is recreated', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    const start = 8_000_000;
    mockNow(start);
    await createRootSession(hook);

    mockNow(start + 6 * MINUTE);
    await deleteSession(hook);

    mockNow(start + 7 * MINUTE);
    await createRootSession(hook);

    mockNow(start + 11 * MINUTE);
    const output = await transformSystem(hook);

    expect(output.system[0]).not.toContain(buildSaveNudge());
  });

  test('buildMemoryInstructions includes the updated memory protocol guidance', () => {
    const instructions = buildMemoryInstructions(
      'root-session',
      'thoth-agents',
    );

    expect(instructions).toContain('### CORE TOOLS');
    expect(instructions).toContain('**Self-check after EVERY task**');
    expect(instructions).toContain('mem_save_prompt');
    expect(instructions).toContain('dale');
    expect(instructions).toContain('sounds good');
    expect(instructions).toContain('thoth-mem-agents');
  });

  test('does not inject memory instructions for child or unknown sessions', async () => {
    const hook = createThothMemHook({
      project: 'thoth-agents',
      enabled: true,
    });

    await createRootSession(hook);
    await createChildSession(hook);

    const childOutput = await transformSystem(hook, 'child-session');
    const unknownOutput = await transformSystem(hook, 'unknown-session');

    expect(childOutput.system[0]).toBe('Base system prompt');
    expect(unknownOutput.system[0]).toBe('Base system prompt');
    expect(childOutput.system[0]).not.toContain('<memory_protocol>');
    expect(unknownOutput.system[0]).not.toContain('<memory_protocol>');
  });

  test('buildSaveNudge returns a non-empty reminder message', () => {
    const nudge = buildSaveNudge();

    expect(nudge.length).toBeGreaterThan(0);
    expect(nudge).toContain('MEMORY REMINDER');
  });
});
