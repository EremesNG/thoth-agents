import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
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
import {
  applyClaudeCodePlan,
  buildClaudeCodeModelPlan,
} from './operations/claude-code';
import type {
  HarnessStatusReport,
  ManagedState,
  ModelRoleInput,
  OperationApplyResult,
  OperationContext,
  OperationPlan,
} from './operations/types';
import { parseCliArgs } from './parser';

interface TestModelServices {
  operationContext(): OperationContext;
  modelRoles(harness: 'codex' | 'opencode' | 'claude'): ModelRoleInput[];
  modelOptions(
    harness: 'codex' | 'opencode' | 'claude',
  ): Promise<ModelOption[]>;
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

    expect(output).toContain('thoth-agents CLI (npm binary: thoth-agents)');
    expect(output).toContain('Open the interactive TUI in a TTY');
    expect(output).toContain('fall back to OpenCode install in CI/non-TTY');
    expect(output).toContain('plugin: ["thoth-agents@latest"]');
    expect(output).toContain(
      'That plugin entry does not create a global thoth-agents command.',
    );
    expect(output).toContain(
      'Run this CLI through a global install, npx, or pnpm dlx.',
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
});

describe('explicit operation commands', () => {
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

    const result = await captureCommand(
      ['model', `--harness=${harness}`, '--role-effort=deep=high'],
      services,
    );
    expect(result.code).toBe(0);
    expect(result.output).toContain(model);
    expect(result.output).toContain('high');
    expect(result.output).toContain('Can apply: yes');
  });

  test('concrete Claude CLI resolution generates exact effort frontmatter', async () => {
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
      expect(applyClaudeCodePlan(plan).applied).toBe(true);
      const output = readFileSync(
        join(home, '.claude', 'skills', 'thoth-agents', 'agents', 'deep.md'),
        'utf8',
      );
      expect(output).toContain(`model: ${model}`);
      expect(output).toContain('effort: high');
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
    const result = await captureCommand(['status']);

    expect(result.code).toBe(0);
    expect(result.output).toContain('OpenCode (opencode)');
    expect(result.output).toContain('Codex (codex)');
    expect(result.output).toContain('State:');
    expectNoPlaceholder(result.output);
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
    expect(result.output).not.toContain('Applied: yes');
    expectNoPlaceholder(result.output);
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
