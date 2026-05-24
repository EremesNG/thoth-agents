import { execFileSync } from 'node:child_process';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getModelOptions, getOpenCodeModelsInvocation } from './model-catalog';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

describe('TUI model catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('Codex options use fetched GPT models.dev OpenAI models without default buffer limits', () => {
    vi.mocked(execFileSync).mockImplementation((_file, _args, options) => {
      const maxBuffer =
        typeof options === 'object' &&
        options !== null &&
        'maxBuffer' in options
          ? options.maxBuffer
          : undefined;
      if (typeof maxBuffer !== 'number' || maxBuffer <= 2_100_000) {
        throw Object.assign(new Error('spawnSync ENOBUFS'), {
          code: 'ENOBUFS',
        });
      }
      return JSON.stringify({
        openai: {
          models: {
            'gpt-5': { name: 'GPT-5' },
            'gpt-5.1': { name: 'GPT-5.1' },
            'gpt-5.2': { name: 'GPT-5.2' },
            'gpt-5-chat-latest': { name: 'GPT-5 Chat Latest' },
            'gpt-6-preview': { name: 'GPT-6 preview' },
            'gpt-live': { name: 'GPT Live' },
            'gpt-4.1-mini': { name: 'GPT-4.1 mini' },
            'gpt-3.5-turbo': { name: 'GPT-3.5 turbo' },
            'o-live': {},
            'o3-pro': { name: 'o3-pro' },
          },
        },
      });
    });

    const options = getModelOptions('codex');

    expect(options.every((option) => option.provider === 'openai')).toBe(true);
    expect(options.map((option) => option.id)).toEqual([
      'gpt-5',
      'gpt-5.1',
      'gpt-5.2',
      'gpt-5-chat-latest',
      'gpt-6-preview',
    ]);
    expect(execFileSync).toHaveBeenCalledWith(
      process.execPath,
      ['-e', expect.stringContaining('fetch')],
      expect.objectContaining({ maxBuffer: expect.any(Number) }),
    );
  });

  test('Codex options are manual-only when models.dev fetch fails', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('models.dev unavailable');
    });

    expect(getModelOptions('codex')).toEqual([]);
  });

  test('OpenCode options use opencode models output', () => {
    vi.mocked(execFileSync).mockReturnValue(
      'openai/gpt-5.2\nanthropic/claude-sonnet-4-5\nopenai/gpt-5.2\n',
    );

    const options = getModelOptions('opencode');

    expect(options.map((option) => option.id)).toEqual([
      'openai/gpt-5.2',
      'anthropic/claude-sonnet-4-5',
    ]);
    const expectedInvocation = getOpenCodeModelsInvocation();
    expect(execFileSync).toHaveBeenCalledWith(
      expectedInvocation.command,
      expectedInvocation.args,
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    const call = vi.mocked(execFileSync).mock.calls[0];
    expect(call?.[2]).toEqual(expect.objectContaining({ timeout: 5_000 }));
  });

  test('OpenCode options are manual-only when opencode models is unavailable', () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('opencode unavailable');
    });

    expect(getModelOptions('opencode')).toEqual([]);
  });

  test('OpenCode uses shell invocation on Windows so command shims resolve', () => {
    expect(getOpenCodeModelsInvocation('win32')).toEqual({
      command: 'opencode models',
      args: [],
      options: expect.objectContaining({
        shell: true,
        timeout: 5_000,
      }),
    });
  });
});
