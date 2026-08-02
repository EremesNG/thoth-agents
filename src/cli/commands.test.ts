import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import {
  formatHarnessList,
  formatHarnessStatusReport,
  formatOperationApplyResult,
  formatOperationPlan,
  printHelp,
  resolveCliModelRoles,
  runCliCommand,
} from './commands';
import type { ModelOption } from './model-catalog';
import { resolveOperationHarness } from './operations';
import {
  applyClaudeCodePlan,
  buildClaudeCodeModelPlan,
} from './operations/claude-code';
import { buildOpenCodeSyncPlan } from './operations/opencode';
import type {
  HarnessStatusReport,
  ManagedState,
  ModelRoleInput,
  OperationApplyResult,
  OperationContext,
  OperationPlan,
} from './operations/types';
import { resolveExecutingPackageVersion } from './package-version';
import { parseCliArgs } from './parser';

interface TestModelServices {
  operationContext(): OperationContext;
  modelRoles(harness: 'codex' | 'opencode' | 'claude'): ModelRoleInput[];
  modelOptions(
    harness: 'codex' | 'opencode' | 'claude',
  ): Promise<ModelOption[]>;
  applyOperationPlan?(plan: OperationPlan): OperationApplyResult;
}

async function captureCommand(
  args: string[],
  services?: TestModelServices,
): Promise<{
  code: number;
  output: string;
  errors: string;
}> {
  const output: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (message?: unknown) => {
    output.push(String(message));
  };
  console.error = (message?: unknown) => {
    errors.push(String(message));
  };

  try {
    const code = await runCliCommand(parseCliArgs(args), services as never);
    return {
      code,
      output: output.join('\n'),
      errors: errors.join('\n'),
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function expectNoPlaceholder(output: string): void {
  expect(output).not.toContain('future phase');
  expect(output).not.toContain('recognized, but its operation implementation');
}

describe('commands plain operation formatters', () => {
  test('help distinguishes the npm binary from the OpenCode plugin entry', () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => {
      lines.push(String(message));
    };

    try {
      printHelp();
    } finally {
      console.log = originalLog;
    }

    const output = lines.join('\n');
    const executing = resolveExecutingPackageVersion();
    expect(executing.ok).toBe(true);
    if (!executing.ok) return;

    expect(output).toContain('thoth-agents CLI (npm binary: thoth-agents)');
    expect(output).toContain('Open the interactive TUI in a TTY');
    expect(output).toContain('fall back to OpenCode install in CI/non-TTY');
    expect(output).toContain(`plugin: ["thoth-agents@${executing.version}"]`);
    expect(output).not.toContain('plugin: ["thoth-agents@latest"]');
    expect(output).toContain(
      '@latest selects the CLI release; OpenCode receives that exact version pin.',
    );
    expect(output).toContain(
      'That plugin entry does not create a global thoth-agents command.',
    );
    expect(output).toContain(
      'Run this CLI through a global install, npx, or pnpm dlx.',
    );
    expect(output).toContain('seven-role roster');
    expect(output).toContain(
      'simplify, tdd, progressive-context-router, and architectural-grilling',
    );
    expect(output).not.toContain('playwright-cli');
    expect(output).toContain(
      'External required skills are installed for every harness',
    );
    expect(output).toContain(
      'Update performs the complete selected-harness CLI refresh',
    );
    expect(output).toContain(
      'Codex and Claude marketplace versions remain native-manager-owned',
    );
    expect(output).toContain('install-state.json');
    expect(output).not.toContain('--skills');
    expect(output).not.toContain('alternative providers');
    expect(output).not.toContain('thoth-mem defaults');
    expect(output).toContain(
      'Provider capability is external and reported only from caller-supplied evidence.',
    );
    expect(output).not.toContain(
      'status                Show managed install status (future phase)',
    );
  });

  test('status output distinguishes all managed states', () => {
    const states: ManagedState[] = [
      'installed',
      'missing',
      'drift',
      'outdated',
      'unknown',
    ];
    const reports: HarnessStatusReport[] = states.map((state) => ({
      harness: 'opencode',
      displayName: 'OpenCode',
      state,
      summary: `state is ${state}`,
      targets: [
        {
          kind: 'file',
          path: `/tmp/${state}.json`,
          label: `${state} config`,
          state,
        },
      ],
      diagnostics: [],
      actions: [],
    }));

    const output = formatHarnessStatusReport(reports);

    for (const state of states) {
      expect(output).toContain(`State: ${state}`);
      expect(output).toContain(`/tmp/${state}.json`);
    }
  });

  test('status output renders provider capability as a separate evidence section', () => {
    const output = formatHarnessStatusReport([
      {
        harness: 'codex',
        displayName: 'Codex',
        state: 'installed',
        summary: 'Consumer-managed files are current.',
        targets: [],
        diagnostics: [],
        actions: [],
        providerCapability: {
          state: 'degraded',
          source: 'harness',
          basis: ['persistence evidenced; continuity not evidenced'],
        },
      },
    ]);

    expect(output).toContain('State: installed');
    expect(output).toContain('Provider capability: degraded');
    expect(output).toContain('Evidence source: harness');
    expect(output).toContain(
      'Evidence basis: persistence evidenced; continuity not evidenced',
    );
    expect(output).not.toContain('State: degraded');
  });

  test('status output labels executing and recorded official CLI versions', () => {
    const output = formatHarnessStatusReport([
      {
        harness: 'claude',
        displayName: 'Claude Code',
        state: 'outdated',
        summary: 'CLI refresh required.',
        targets: [
          {
            kind: 'file',
            label: 'CLI-managed install version',
            path: '/home/.config/thoth-agents/install-state.json',
            state: 'outdated',
            expected: 'executing 0.4.8',
            observed: 'recorded 0.4.7',
          },
        ],
        diagnostics: [],
        actions: [],
      },
    ]);

    expect(output).toContain('Official CLI-managed install:');
    expect(output).toContain('Executing CLI version: 0.4.8');
    expect(output).toContain('Recorded complete-install version: 0.4.7');
    expect(output).toContain(
      'Native marketplace versions do not advance this record.',
    );
  });

  test('list output shows supported harness metadata and unavailable entries', () => {
    const output = formatHarnessList([
      {
        id: 'opencode',
        displayName: 'OpenCode',
        available: true,
        description: 'OpenCode plugin configuration',
        actions: [
          {
            id: 'opencode-status',
            kind: 'status',
            label: 'Status',
            description: 'Inspect OpenCode config',
            dryRun: true,
            requiresConfirmation: false,
          },
        ],
      },
      {
        id: 'claude',
        displayName: 'Claude',
        available: false,
        description: 'Unsupported harness',
        reason: 'Not supported.',
        actions: [],
      },
    ]);

    expect(output).toContain('OpenCode [available]');
    expect(output).toContain('Claude [unavailable]');
    expect(output).toContain('Status - Inspect OpenCode config');
    expect(output).toContain('Not supported.');
  });

  test('unsupported harness metadata names the exact supported scope without fallback', () => {
    const output = formatHarnessList([resolveOperationHarness('gemini')]);

    expect(output).toContain('gemini [unavailable]');
    expect(output).toContain('Unsupported harness "gemini".');
    expect(output).toContain('opencode, codex, claude');
    expect(output).not.toMatch(/fallback|best effort/i);
  });

  test('mutation plan output identifies target harness and safety metadata', () => {
    const plan: OperationPlan = {
      id: 'opencode-update-preview',
      harness: 'opencode',
      action: 'update',
      title: 'Update OpenCode managed config',
      summary: 'Preview OpenCode plugin config changes.',
      dryRun: true,
      canApply: false,
      targets: [
        {
          kind: 'file',
          path: 'C:\\Users\\Ada\\opencode.jsonc',
          label: 'OpenCode config',
          state: 'outdated',
        },
      ],
      surfaces: [],
      backup: {
        required: true,
        strategy: 'managed-backup-file',
        destinations: [
          {
            path: 'C:\\Users\\Ada\\opencode.jsonc.bak',
            label: 'OpenCode config backup',
          },
        ],
      },
      items: [
        {
          title: 'Ensure plugin points at thoth-agents@latest',
          target: {
            kind: 'file',
            path: 'C:\\Users\\Ada\\opencode.jsonc',
          },
          state: 'outdated',
          preview: 'plugin: ["thoth-agents@latest"]',
        },
      ],
      warnings: [
        {
          severity: 'minor',
          message: 'OpenCode owns plugin cache refresh behavior.',
        },
      ],
      disclaimers: [
        {
          message:
            'The npm binary still requires global install, npx, or pnpm dlx.',
        },
      ],
    };

    const output = formatOperationPlan(plan);

    expect(output).toContain('Target harness: OpenCode (opencode)');
    expect(output).toContain('Dry run: yes');
    expect(output).toContain('Can apply: no');
    expect(output).toContain('C:\\Users\\Ada\\opencode.jsonc');
    expect(output).toContain('C:\\Users\\Ada\\opencode.jsonc.bak');
    expect(output).toContain('OpenCode owns plugin cache refresh behavior.');
    expect(output).toContain('The npm binary still requires');
  });

  test('OpenCode sync output renders unique main and lite backups without bundled phase skills', () => {
    const xdgRoot = mkdtempSync(join(tmpdir(), 'thoth-opencode-format-'));
    const root = join(xdgRoot, 'opencode');
    const originalConfigDir = process.env.OPENCODE_CONFIG_DIR;
    const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.OPENCODE_CONFIG_DIR = root;
    process.env.XDG_CONFIG_HOME = xdgRoot;

    try {
      const output = formatOperationPlan(
        buildOpenCodeSyncPlan({
          cwd: root,
          env: { HOME: join(root, 'home') },
        }),
      );
      const backupPaths = [
        join(root, 'opencode.json.bak'),
        join(root, 'thoth-agents.json.bak'),
      ];

      for (const backupPath of backupPaths) {
        expect(output).toContain(backupPath);
        expect(output.split(backupPath)).toHaveLength(2);
      }
      expect(output).toContain('Write thoth-agents seven-role config');
      expect(output).not.toContain(
        'Refresh bundled thoth-agents OpenCode skills',
      );
    } finally {
      if (originalConfigDir === undefined) {
        delete process.env.OPENCODE_CONFIG_DIR;
      } else {
        process.env.OPENCODE_CONFIG_DIR = originalConfigDir;
      }
      if (originalXdgConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
      }
      rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  test('apply result output renders paths, backups, warnings, and disclaimers', () => {
    const result: OperationApplyResult = {
      harness: 'codex',
      action: 'model-config',
      applied: true,
      summary: 'Updated managed Codex role model lines.',
      changedTargets: [
        {
          kind: 'file',
          path: 'C:\\Users\\Ada\\.codex\\agents\\quick.toml',
          label: 'quick subagent TOML',
        },
      ],
      backups: [
        {
          path: 'C:\\Users\\Ada\\.codex\\agents\\quick.toml.bak',
          label: 'quick TOML backup',
        },
      ],
      warnings: [
        {
          severity: 'important',
          message: 'Provider-per-role enforcement is instruction-level.',
        },
      ],
      disclaimers: [
        {
          message: 'Root Codex settings were not modified.',
        },
      ],
    };

    const output = formatOperationApplyResult(result);

    expect(output).toContain('Target harness: Codex (codex)');
    expect(output).toContain('Applied: yes');
    expect(output).toContain('quick.toml');
    expect(output).toContain('quick.toml.bak');
    expect(output).toContain('Provider-per-role enforcement');
    expect(output).toContain('Root Codex settings were not modified.');
  });

  test('blocked plan and apply output render diagnostic codes and target observations', () => {
    const targets = [
      {
        kind: 'config' as const,
        label: 'thoth-agents config',
        state: 'drift' as const,
        observed: 'preset: agents; roles: 7/10',
      },
    ];
    const warnings = [
      {
        severity: 'important' as const,
        code: 'opencode-roster-drift',
        message: 'Managed OpenCode roster uses the legacy agents preset.',
      },
    ];
    const blockedPlan: OperationPlan = {
      id: 'opencode-model-config-preview',
      harness: 'opencode',
      action: 'model-config',
      title: 'Configure OpenCode role model overrides',
      summary: 'Model changes are blocked by managed health.',
      dryRun: true,
      canApply: false,
      targets,
      blockerTargets: targets,
      surfaces: [],
      backup: { required: false, strategy: 'none' },
      items: [],
      warnings,
      disclaimers: [],
    };
    const blockedResult: OperationApplyResult = {
      harness: 'opencode' as const,
      action: 'model-config' as const,
      applied: false,
      summary: 'OpenCode model changes remain blocked.',
      changedTargets: [],
      diagnosticTargets: targets,
      backups: [],
      warnings,
      disclaimers: [],
    };

    for (const output of [
      formatOperationPlan(blockedPlan),
      formatOperationApplyResult(blockedResult),
    ]) {
      expect(output).toContain(
        '[important] [opencode-roster-drift] Managed OpenCode roster uses the legacy agents preset.',
      );
      expect(output).toContain(
        'thoth-agents config: config [drift] observed preset: agents; roles: 7/10',
      );
    }
    expect(formatOperationPlan(blockedPlan)).toContain('Blocking targets:');
  });
});

describe('explicit operation commands', () => {
  test('variant-only OpenCode orchestrator input preserves the canonical default model', () => {
    expect(
      resolveCliModelRoles('opencode', [
        {
          role: 'orchestrator',
          effort: { kind: 'effort', value: 'custom-variant' },
        },
      ]),
    ).toEqual([
      {
        role: 'orchestrator',
        model: 'openai/gpt-5.6-sol',
        effort: { kind: 'effort', value: 'custom-variant' },
      },
    ]);
  });

  test.each([
    ['codex', 'gpt-5.6-sol', 'openai/gpt-5.6-sol'],
    ['opencode', 'openai/gpt-5.6-sol', 'openai/gpt-5.6-sol'],
    ['claude', 'anthropic/claude-opus-4.6', 'anthropic/claude-opus-4.6'],
  ] as const)('effort-only %s command preserves current model and attaches exact catalog metadata', async (harness, model, catalogId) => {
    const services: TestModelServices = {
      operationContext: () => ({ cwd: process.cwd() }),
      modelRoles: () => [{ role: 'deep', model }],
      modelOptions: async () => [
        {
          id: model,
          catalogId,
          label: model,
          provider: catalogId.split('/')[0] ?? '',
          efforts: ['high'],
          source: 'remote',
        },
      ],
    };

    expect(
      resolveCliModelRoles(
        harness,
        [{ role: 'deep', effort: { kind: 'effort', value: 'high' } }],
        {
          currentRoles: services.modelRoles(harness),
          modelOptions: await services.modelOptions(harness),
        } as never,
      ),
    ).toEqual([
      {
        role: 'deep',
        model,
        provider: catalogId.split('/')[0],
        catalogId,
        availableEfforts: ['high'],
        effort: { kind: 'effort', value: 'high' },
      },
    ]);

    const originalConfigDir = process.env.OPENCODE_CONFIG_DIR;
    const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    const isolatedRoot =
      harness === 'opencode'
        ? mkdtempSync(join(tmpdir(), 'opencode-cli-effort-'))
        : undefined;
    try {
      if (isolatedRoot) {
        process.env.XDG_CONFIG_HOME = isolatedRoot;
        process.env.OPENCODE_CONFIG_DIR = join(isolatedRoot, 'opencode');
      }

      const result = await captureCommand(
        ['model', `--harness=${harness}`, '--role-effort=deep=high'],
        services,
      );
      expect(result.code).toBe(0);
      expect(result.output).toContain(model);
      expect(result.output).toContain('high');
      expect(result.output).toContain(
        harness === 'claude' ? 'Can apply: no' : 'Can apply: yes',
      );
      if (harness === 'claude') {
        expect(result.output).toContain('manager-owned');
      }
    } finally {
      if (isolatedRoot) {
        if (originalConfigDir === undefined) {
          delete process.env.OPENCODE_CONFIG_DIR;
        } else {
          process.env.OPENCODE_CONFIG_DIR = originalConfigDir;
        }
        if (originalXdgConfigHome === undefined) {
          delete process.env.XDG_CONFIG_HOME;
        } else {
          process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
        }
        rmSync(isolatedRoot, { recursive: true, force: true });
      }
    }
  });

  test('concrete Claude CLI resolution refuses to rewrite manager cache frontmatter', async () => {
    const home = mkdtempSync(join(tmpdir(), 'claude-cli-effort-'));
    const model = 'anthropic/claude-opus-4.6';
    try {
      const roles = resolveCliModelRoles(
        'claude',
        [{ role: 'deep', effort: { kind: 'effort', value: 'high' } }],
        {
          currentRoles: [{ role: 'deep', model }],
          modelOptions: [
            {
              id: model,
              catalogId: model,
              label: model,
              provider: 'anthropic',
              efforts: ['low', 'high'],
              source: 'remote',
            },
          ],
        } as never,
      );
      const plan = buildClaudeCodeModelPlan(
        { harness: 'claude', dryRun: true, roles },
        { cwd: process.cwd(), scope: 'user', homeDir: home },
      );
      expect(plan.canApply).toBe(false);
      expect(applyClaudeCodePlan(plan).applied).toBe(false);
      expect(
        existsSync(
          join(home, '.claude', 'skills', 'thoth-agents', 'agents', 'deep.md'),
        ),
      ).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('help documents repeatable role effort input', () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown) => lines.push(String(message));
    try {
      printHelp();
    } finally {
      console.log = originalLog;
    }
    expect(lines.join('\n')).toContain('--role-effort=role=effort');
  });

  test('status dispatches to operation status services for all harnesses', async () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), 'thoth-command-status-'));
    const originalConfigDir = process.env.OPENCODE_CONFIG_DIR;
    const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.OPENCODE_CONFIG_DIR = join(isolatedRoot, 'opencode');
    process.env.XDG_CONFIG_HOME = isolatedRoot;
    const services: TestModelServices = {
      operationContext: () =>
        ({
          cwd: isolatedRoot,
          env: {
            HOME: join(isolatedRoot, 'home'),
            XDG_CONFIG_HOME: isolatedRoot,
          },
          homeDir: join(isolatedRoot, 'home'),
          packageRoot: process.cwd(),
          commandExecutor: () => ({
            exitCode: 0,
            stdout: '[]',
            stderr: '',
          }),
        }) as OperationContext,
      modelRoles: () => [],
      modelOptions: async () => [],
    };

    try {
      const result = await captureCommand(['status'], services);

      expect(result.code).toBe(0);
      expect(result.output).toContain('OpenCode (opencode)');
      expect(result.output).toContain('Codex (codex)');
      expect(result.output).toContain('State:');
      expectNoPlaceholder(result.output);
    } finally {
      if (originalConfigDir === undefined) {
        delete process.env.OPENCODE_CONFIG_DIR;
      } else {
        process.env.OPENCODE_CONFIG_DIR = originalConfigDir;
      }
      if (originalXdgConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
      }
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  test('list dispatches to operation registry metadata', async () => {
    const result = await captureCommand(['list']);

    expect(result.code).toBe(0);
    expect(result.output).toContain('OpenCode [available]');
    expect(result.output).toContain('Codex [available]');
    expect(result.output).toContain('Actions:');
    expect(result.output).toContain('Update - Preview');
    expectNoPlaceholder(result.output);
  });

  test('update renders a dry-run plan for the default harness', async () => {
    const result = await captureCommand(['update']);

    expect(result.code).toBe(0);
    expect(result.output).toContain('Target harness: OpenCode (opencode)');
    expect(result.output).toContain('Action: update');
    expect(result.output).toContain('Dry run: yes');
    expect(result.output).toContain('Plan provider-owned thoth-mem setup');
    expect(result.output).toContain('Record completed OpenCode CLI install');
    expect(result.output).not.toContain(
      'Ensure OpenCode plugin points at thoth-agents@latest',
    );
    expect(result.output).not.toContain('Applied: yes');
    expectNoPlaceholder(result.output);
  });

  test('update preview is non-mutating and failed apply returns nonzero', async () => {
    const isolatedRoot = mkdtempSync(join(tmpdir(), 'thoth-command-update-'));
    const originalConfigDir = process.env.OPENCODE_CONFIG_DIR;
    const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    process.env.OPENCODE_CONFIG_DIR = join(isolatedRoot, 'opencode');
    process.env.XDG_CONFIG_HOME = isolatedRoot;
    const applyOperationPlan = vi.fn(
      (plan: OperationPlan): OperationApplyResult => ({
        harness: plan.harness,
        action: plan.action,
        applied: false,
        summary: 'injected update failure',
        changedTargets: [],
        backups: [],
        warnings: [
          {
            severity: 'critical',
            message: 'required finalization failed',
          },
        ],
        disclaimers: [],
      }),
    );
    const services: TestModelServices = {
      operationContext: () => ({
        cwd: isolatedRoot,
        env: {
          HOME: join(isolatedRoot, 'home'),
          XDG_CONFIG_HOME: isolatedRoot,
        },
      }),
      modelRoles: () => [],
      modelOptions: async () => [],
      applyOperationPlan,
    };

    try {
      const preview = await captureCommand(
        ['update', '--harness=opencode'],
        services,
      );
      expect(preview.code).toBe(0);
      expect(applyOperationPlan).not.toHaveBeenCalled();
      expect(existsSync(join(isolatedRoot, 'opencode', 'opencode.json'))).toBe(
        false,
      );

      const applied = await captureCommand(
        ['update', '--harness=opencode', '--apply'],
        services,
      );
      expect(applied.code).toBe(1);
      expect(applied.output).toContain('Applied: no');
      expect(applied.output).toContain('injected update failure');
      expect(applyOperationPlan).toHaveBeenCalledOnce();
    } finally {
      if (originalConfigDir === undefined) {
        delete process.env.OPENCODE_CONFIG_DIR;
      } else {
        process.env.OPENCODE_CONFIG_DIR = originalConfigDir;
      }
      if (originalXdgConfigHome === undefined) {
        delete process.env.XDG_CONFIG_HOME;
      } else {
        process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
      }
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  test('sync renders a dry-run plan for an explicit harness', async () => {
    const result = await captureCommand(['sync', '--harness=codex']);

    expect(result.code).toBe(0);
    expect(result.output).toContain('Target harness: Codex (codex)');
    expect(result.output).toContain('Action: sync');
    expect(result.output).toContain('Dry run: yes');
    expect(result.output).not.toContain('Applied: yes');
    expectNoPlaceholder(result.output);
  });

  test('model without parsed model input shows safe guidance', async () => {
    const result = await captureCommand(['model']);

    expect(result.code).toBe(1);
    expect(result.output).toContain(
      'Model command requires explicit model input.',
    );
    expect(result.output).toContain('--apply');
    expectNoPlaceholder(result.output);
  });

  test('model with parsed role input renders a model operation plan', async () => {
    const result = await captureCommand([
      'model',
      '--harness=codex',
      '--role=deep',
      '--model=openai/gpt-5.4-mini',
    ]);

    expect(result.code).toBe(0);
    expect(result.output).toContain('Target harness: Codex (codex)');
    expect(result.output).toContain('Action: model-config');
    expect(result.output).toContain('Set deep Codex subagent model line');
    expectNoPlaceholder(result.output);
  });
});
