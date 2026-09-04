import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { loadModelsDevCatalog } from '../model-catalog';
import {
  effortChoicesForModel,
  getModelOptions,
  getOpenCodeModelsInvocation,
} from './model-catalog';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('../model-catalog', () => ({
  loadModelsDevCatalog: vi.fn(),
}));

const checkedAt = '2026-07-11T00:00:00.000Z';

function loaded(
  models: Awaited<ReturnType<typeof loadModelsDevCatalog>>['models'],
) {
  vi.mocked(loadModelsDevCatalog).mockResolvedValue({
    models: [...models],
    source: 'remote',
    stale: false,
    checkedAt,
    warnings: [],
  });
}

describe('TUI model catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loaded([]);
  });

  test('Codex options use exact model effort metadata and exclude undocumented controls', async () => {
    loaded([
      {
        id: 'gpt-5.6-sol',
        catalogId: 'openai/gpt-5.6-sol',
        label: 'GPT 5.6 Sol',
        provider: 'openai',
        efforts: ['none', 'low', 'max', 'ultra', 'future', 'budget_tokens'],
        source: 'remote',
      },
      {
        id: 'gpt-4.1-mini',
        catalogId: 'openai/gpt-4.1-mini',
        label: 'GPT-4.1 mini',
        provider: 'openai',
        efforts: ['high'],
        source: 'remote',
      },
    ]);

    const options = await getModelOptions('codex');

    expect(options).toEqual([
      expect.objectContaining({
        id: 'gpt-5.6-sol',
        catalogId: 'openai/gpt-5.6-sol',
        efforts: ['none', 'low', 'max', 'ultra'],
      }),
    ]);
    expect(options[0]?.efforts).not.toContain('budget_tokens');
    expect(options[0]?.efforts).not.toContain('toggle');
  });

  test('Codex options are manual-only when models.dev has no usable records', async () => {
    expect(await getModelOptions('codex')).toEqual([]);
  });

  test('OpenCode options compose native availability with catalog and runtime effort support', async () => {
    vi.mocked(execFileSync).mockReturnValue(
      'openai/gpt-5.6-sol\nanthropic/claude-sonnet-4-5\nopenai/gpt-5.6-sol\n',
    );
    loaded([
      {
        id: 'gpt-5.6-sol',
        catalogId: 'openai/gpt-5.6-sol',
        label: 'GPT 5.6 Sol',
        provider: 'openai',
        efforts: ['none', 'high', 'xhigh', 'max'],
        source: 'remote',
      },
    ]);

    const options = await getModelOptions('opencode');

    expect(options).toEqual([
      expect.objectContaining({
        id: 'openai/gpt-5.6-sol',
        catalogId: 'openai/gpt-5.6-sol',
        efforts: ['none', 'high', 'xhigh'],
      }),
      expect.objectContaining({
        id: 'anthropic/claude-sonnet-4-5',
        efforts: [],
      }),
    ]);
    const expectedInvocation = getOpenCodeModelsInvocation();
    expect(execFileSync).toHaveBeenCalledWith(
      expectedInvocation.command,
      expectedInvocation.args,
      expect.objectContaining({ timeout: 5_000 }),
    );
  });

  test('OpenCode pure discovery avoids mocked plugin startup side effects without changing parsing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'thoth-opencode-models-'));
    const marker = join(root, 'plugin-started');
    vi.mocked(execFileSync).mockImplementation((command, args) => {
      const invocation = [String(command), ...(args ?? [])].join(' ');
      if (!invocation.split(/\s+/).includes('--pure')) {
        writeFileSync(marker, 'external plugin startup side effect');
      }
      return 'openai/gpt-5.6-sol\n';
    });

    try {
      const options = await getModelOptions('opencode');

      expect(options.map(({ id }) => id)).toEqual(['openai/gpt-5.6-sol']);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('OpenCode options are manual-only when opencode models is unavailable', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('opencode unavailable');
    });

    expect(await getModelOptions('opencode')).toEqual([]);
  });

  test('Claude aliases and concrete catalog models expose official intersections', async () => {
    loaded([
      {
        id: 'claude-opus-4.6',
        catalogId: 'anthropic/claude-opus-4.6',
        label: 'Claude Opus 4.6',
        provider: 'anthropic',
        efforts: ['none', 'low', 'high', 'max'],
        source: 'remote',
      },
    ]);
    const options = await getModelOptions('claude');

    expect(options.map((option) => option.id)).toEqual([
      'sonnet',
      'opus',
      'haiku',
      'inherit',
      'anthropic/claude-opus-4.6',
    ]);
    expect(options[0]?.efforts).toEqual([
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]);
    expect(options.at(-1)).toEqual(
      expect.objectContaining({
        catalogId: 'anthropic/claude-opus-4.6',
        efforts: ['low', 'high', 'max'],
      }),
    );
    expect(loadModelsDevCatalog).toHaveBeenCalledTimes(1);
  });

  test('Pi exposes every provider while limiting effort to Pi-supported values', async () => {
    loaded([
      {
        id: 'gpt-5.6-sol',
        catalogId: 'openai/gpt-5.6-sol',
        label: 'GPT 5.6 Sol',
        provider: 'openai',
        efforts: [
          'off',
          'minimal',
          'low',
          'medium',
          'high',
          'xhigh',
          'max',
          'ultra',
        ],
        source: 'remote',
      },
      {
        id: 'claude-opus-4.6',
        catalogId: 'anthropic/claude-opus-4.6',
        label: 'Claude Opus 4.6',
        provider: 'anthropic',
        efforts: ['low', 'high'],
        source: 'remote',
      },
    ]);

    const options = await getModelOptions('pi');

    expect(options.map((option) => option.provider)).toEqual([
      'openai',
      'anthropic',
    ]);
    expect(options[0]?.efforts).toEqual([
      'off',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
    ]);
  });

  test('effort choices always include inherit without mutating catalog values', () => {
    const option = {
      id: 'gpt-5.6-sol',
      label: 'GPT 5.6 Sol',
      provider: 'openai',
      efforts: ['low', 'high'] as const,
      source: 'remote' as const,
    };

    expect(effortChoicesForModel(option)).toEqual(['inherit', 'low', 'high']);
    expect(effortChoicesForModel(undefined)).toEqual(['inherit']);
    expect(option.efforts).toEqual(['low', 'high']);
  });

  test('OpenCode uses pure mode in POSIX execFile arguments', () => {
    expect(getOpenCodeModelsInvocation('linux')).toEqual({
      command: 'opencode',
      args: ['models', '--pure'],
      options: expect.objectContaining({
        timeout: 5_000,
      }),
    });
  });

  test('OpenCode uses pure mode in the Windows shell command so shims resolve', () => {
    expect(getOpenCodeModelsInvocation('win32')).toEqual({
      command: 'opencode models --pure',
      args: [],
      options: expect.objectContaining({
        shell: true,
        timeout: 5_000,
      }),
    });
  });
});
