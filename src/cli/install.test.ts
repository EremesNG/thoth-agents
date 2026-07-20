import { describe, expect, test, vi } from 'vitest';
import { buildCodexSetupPlan } from './codex-install';
import {
  applyCodexPluginSetup,
  buildCodexPluginSetupPlan,
} from './codex-plugin-install';
import { createInstallConfig, install } from './install';
import type { ThothMemSetupResult } from './thoth-mem-install';

vi.mock('./codex-plugin-install', () => ({
  buildCodexPluginSetupPlan: vi.fn(() => ({ dryRun: true })),
  formatCodexPluginSetupPlan: vi.fn(() => 'Codex plugin setup plan'),
  applyCodexPluginSetup: vi.fn(() => ({
    success: true,
    changed: [],
    diagnostics: [],
  })),
}));

vi.mock('./codex-install', () => ({
  buildCodexSetupPlan: vi.fn(() => ({ dryRun: true })),
  formatCodexSetupPlan: vi.fn(() => 'Codex setup plan'),
  applyCodexSetup: vi.fn(() => ({
    success: true,
    changed: false,
    diagnostics: [],
  })),
}));

vi.mock('./claude-code-install', () => ({
  buildClaudeCodeSetupPlan: vi.fn(() => ({ dryRun: true })),
  formatClaudeCodeSetupPlan: vi.fn(() => 'Claude setup plan'),
  applyClaudeCodeSetup: vi.fn(() => ({
    success: true,
    changed: false,
    diagnostics: [],
  })),
}));

function providerExitCode(
  status: ThothMemSetupResult['status'],
): number | null {
  switch (status) {
    case 'complete':
      return 0;
    case 'failed':
      return 1;
    case 'partial':
      return 2;
    case 'requires_user_action':
      return 3;
    case 'invalid':
      return null;
  }
}

function providerResult(
  harness: 'opencode' | 'codex' | 'claude',
  status: ThothMemSetupResult['status'] = 'complete',
): ThothMemSetupResult {
  return {
    success: status === 'complete',
    evidenceValid: status !== 'invalid',
    status,
    changed: false,
    harness,
    target: `C:/provider/${harness}`,
    steps: [{ name: 'Plan provider setup', outcome: 'planned' }],
    diagnostics: [`provider ${status}`],
    manualActions:
      status === 'complete' ? [] : ['Review provider-owned setup state.'],
    receipt: status === 'partial' ? 'C:/receipts/provider-partial.json' : null,
    command: 'npx',
    args: [
      '-y',
      'thoth-mem@latest',
      'setup',
      harness,
      '--scope',
      'global',
      '--plan',
      '--json',
    ],
    exitCode: providerExitCode(status),
    ...(status === 'invalid' ? { error: 'invalid provider evidence' } : {}),
  };
}

describe('install', () => {
  test('createInstallConfig has no optional skill switch', () => {
    const config = createInstallConfig({
      tui: false,
      tmux: 'no',
      reset: false,
    });

    expect(config).not.toHaveProperty('installSkills');
    expect(config).not.toHaveProperty('installCustomSkills');
  });

  test('createInstallConfig keeps only harness install settings', () => {
    const config = createInstallConfig({
      tui: false,
      tmux: 'yes',
      dryRun: true,
      reset: true,
    });

    expect(config).not.toHaveProperty('installSkills');
    expect(config).not.toHaveProperty('installCustomSkills');
    expect(config.hasTmux).toBe(true);
    expect(config.dryRun).toBe(true);
    expect(config.reset).toBe(true);
  });

  test('createInstallConfig keeps OpenCode installer behavior when Codex is configured elsewhere', () => {
    const config = createInstallConfig({
      tui: false,
      dryRun: true,
      reset: false,
    });

    expect(config).not.toHaveProperty('harness');
    expect(config).not.toHaveProperty('installCustomSkills');
  });

  test('Codex installation applies the native plugin-manager plan', async () => {
    vi.clearAllMocks();
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install(
        {
          agent: 'codex',
          tui: false,
          tmux: 'no',
          dryRun: true,
          reset: false,
        },
        { runThothMemSetup: () => providerResult('codex') },
      );

      expect(code).toBe(0);
      expect(buildCodexPluginSetupPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
          projectRoot: process.cwd(),
        }),
      );
      expect(applyCodexPluginSetup).toHaveBeenCalledOnce();
      expect(lines.join('\n')).toContain('Codex plugin setup plan');
    } finally {
      console.log = originalLog;
    }
  });

  test('Codex installation stops before managed files when the native manager fails', async () => {
    vi.clearAllMocks();
    vi.mocked(applyCodexPluginSetup).mockReturnValueOnce({
      success: false,
      changed: [],
      diagnostics: ['manager unavailable'],
      error: 'Codex native plugin manager state is not safe to mutate.',
    });
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install(
        {
          agent: 'codex',
          tui: false,
          tmux: 'no',
          dryRun: false,
          reset: false,
        },
        { runThothMemSetup: () => providerResult('codex') },
      );

      expect(code).toBe(1);
      expect(buildCodexSetupPlan).not.toHaveBeenCalled();
      expect(lines.join('\n')).toContain(
        'Codex plugin install failed: Codex native plugin manager state is not safe to mutate.',
      );
    } finally {
      console.log = originalLog;
    }
  });

  test.each([
    'opencode',
    'codex',
    'claude',
  ] as const)('%s dry-run completes only after shared thoth-mem setup planning', async (agent) => {
    const lines: string[] = [];
    const originalLog = console.log;
    const runThothMemSetup = vi.fn(() => providerResult(agent));
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install(
        {
          agent,
          tui: false,
          tmux: 'no',
          dryRun: true,
          reset: false,
        },
        { runThothMemSetup },
      );
      const output = lines.join('\n');

      expect(code).toBe(0);
      expect(runThothMemSetup).toHaveBeenCalledOnce();
      expect(runThothMemSetup).toHaveBeenCalledWith(
        expect.objectContaining({ harness: agent, dryRun: true }),
      );
      expect(output).toContain('thoth-mem setup plan confirmed');
      expect(output).toContain('provider complete');
      expect(output).toContain('Required external skills');
    } finally {
      console.log = originalLog;
    }
  });

  test('OpenCode dry-run reports the complete combined installation contract', async () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install(
        {
          agent: 'opencode',
          tui: false,
          tmux: 'no',
          dryRun: true,
          reset: false,
        },
        { runThothMemSetup: () => providerResult('opencode') },
      );
      const output = lines.join('\n');

      expect(code).toBe(0);
      expect(output).toMatch(/thoth-agents (?:installation complete|updated)!/);
      expect(output).not.toContain('Delegation results persisted to disk');
      expect(output).not.toContain('thoth-mem memory defaults');
      expect(output).toContain('thoth-mem setup plan confirmed');
      expect(output).toContain(
        'thoth-mem remains the owner of hooks, MCP, skill, lifecycle, persistence, receipts, and recovery.',
      );
      expect(output).toContain('simplify');
      expect(output).toContain('tdd');
      expect(output).toContain('progressive-context-router');
      expect(output).toContain('architectural-grilling');
      expect(output).not.toContain('playwright-cli');
      expect(output).toContain('opencode');
    } finally {
      console.log = originalLog;
    }
  });

  test('does not claim combined installation success for partial provider setup', async () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      const code = await install(
        {
          agent: 'opencode',
          tui: false,
          tmux: 'no',
          dryRun: true,
          reset: false,
        },
        {
          runThothMemSetup: () => providerResult('opencode', 'partial'),
        },
      );
      const output = lines.join('\n');

      expect(code).toBe(1);
      expect(output).toContain('thoth-mem setup is incomplete: partial');
      expect(output).toContain('Review provider-owned setup state.');
      expect(output).toContain('C:/receipts/provider-partial.json');
      expect(output).not.toMatch(/installation complete!/);
    } finally {
      console.log = originalLog;
    }
  });
});
