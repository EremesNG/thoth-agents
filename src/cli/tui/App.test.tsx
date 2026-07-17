import { render } from 'ink-testing-library';
import { describe, expect, test } from 'vitest';
import type {
  HarnessStatusReport,
  ModelRoleInput,
  OperationApplyResult,
  OperationPlan,
} from '../operations';
import { App } from './App';
import type { ModelOption } from './model-catalog';
import type { TuiAction, TuiOperations } from './operations';

const codexModelCatalogNote = [
  'This list may not include every available model.',
  'Official Codex model list: https://developers.openai.com/codex/models',
];

const longWindowsPath =
  'C:\\Users\\EremesNG\\AppData\\Roaming\\opencode\\very-long-managed-thoth-agents-config-directory\\thoth-agents.json';

function status(summary = 'OpenCode ready'): HarnessStatusReport {
  return {
    harness: 'opencode',
    displayName: 'OpenCode',
    state: 'installed',
    summary,
    targets: [
      {
        kind: 'config',
        label: 'OpenCode config',
        path: longWindowsPath,
        state: 'installed',
        observed: 'plugin includes thoth-agents@latest',
      },
    ],
    diagnostics: [],
    actions: [],
  };
}

function opencodeStatusWithSkills(): HarnessStatusReport {
  return {
    ...status('OpenCode skills ready'),
    targets: [
      ...status().targets,
      {
        kind: 'skill',
        label: 'Simplify',
        path: 'C:\\Users\\EremesNG\\.agents\\skills\\simplify\\SKILL.md',
        state: 'installed',
        observed: 'recommended global skill installed',
      },
      {
        kind: 'skill',
        label: 'Playwright-CLI',
        path: 'C:\\Users\\EremesNG\\.agents\\skills\\playwright-cli\\SKILL.md',
        state: 'missing',
        observed: 'recommended global skill missing',
      },
    ],
  };
}

function manyCodexTargets(): HarnessStatusReport['targets'] {
  return [
    {
      kind: 'file' as const,
      label: 'personal plugin source',
      path: 'C:\\Users\\EremesNG\\.codex\\plugins\\thoth-agents\\skills\\sdd-archive\\SKILL.md',
      state: 'installed' as const,
      observed: 'current',
    },
    {
      kind: 'file' as const,
      label: 'designer agent',
      path: 'C:\\Users\\EremesNG\\.codex\\agents\\thoth-agents-designer.toml',
      state: 'installed' as const,
    },
    {
      kind: 'file' as const,
      label: 'plugin manifest',
      path: 'C:\\Users\\EremesNG\\.codex\\plugins\\thoth-agents\\.codex-plugin\\plugin.json',
      state: 'installed' as const,
    },
    {
      kind: 'file' as const,
      label: 'marketplace registry',
      path: 'C:\\Users\\EremesNG\\.codex\\plugins\\marketplace.json',
      state: 'installed' as const,
    },
    {
      kind: 'file' as const,
      label: 'root instructions',
      path: 'C:\\DEV\\Proyectos\\Webstorm\\thoth-agents\\AGENTS.md',
      state: 'installed' as const,
    },
    ...Array.from({ length: 8 }, (_, index) => ({
      kind: 'file' as const,
      label: `Codex plugin file ${index + 1}`,
      path: `C:\\Users\\EremesNG\\.codex\\plugins\\file-${index + 1}.toml`,
      state: 'installed' as const,
    })),
  ];
}

function plan(
  action: Exclude<TuiAction, 'status' | 'list'>,
  roles: readonly ModelRoleInput[] = [],
): OperationPlan {
  return {
    id: `opencode-${action}-preview`,
    harness: 'opencode',
    action: action === 'model' ? 'model-config' : action,
    title:
      action === 'model'
        ? 'Configure OpenCode role model overrides'
        : `Preview ${action}`,
    summary: 'No writes until explicit apply.',
    dryRun: true,
    canApply: true,
    targets: status().targets,
    surfaces: [
      {
        id: 'opencode-config',
        label: 'OpenCode config',
        path: longWindowsPath,
        state: 'installed',
      },
    ],
    backup: {
      required: true,
      strategy: 'managed-backup-file',
      destinations: [{ path: `${longWindowsPath}.bak`, label: 'backup' }],
    },
    items:
      roles.length > 0
        ? roles.map((role) => ({
            title: `Set ${role.role} model`,
            target: status().targets[0],
            preview: JSON.stringify(role),
          }))
        : [
            {
              title: 'Ensure managed config',
              target: status().targets[0],
              preview: 'plugin: ["thoth-agents@latest"]',
            },
          ],
    warnings: [
      {
        severity: 'minor',
        message: 'Preview only.',
      },
    ],
    disclaimers: [
      {
        message: 'Backups are managed by the existing operation helper.',
      },
    ],
  };
}

function operations(
  modelOptionsOverride?: Partial<
    Record<'codex' | 'opencode', ModelOption[] | Promise<ModelOption[]>>
  >,
  statusOverride?: Partial<Record<'codex' | 'opencode', HarnessStatusReport>>,
  modelRolesOverride?: Partial<Record<'codex' | 'opencode', ModelRoleInput[]>>,
): TuiOperations & {
  applied: OperationPlan[];
  modelPlanRoles: ModelRoleInput[][];
  planned: Array<{ harness: 'codex' | 'opencode'; action: string }>;
} {
  let refreshes = 0;
  const applied: OperationPlan[] = [];
  const planned: Array<{ harness: 'codex' | 'opencode'; action: string }> = [];
  const modelPlanRoles: ModelRoleInput[][] = [];
  return {
    applied,
    planned,
    modelPlanRoles,
    status(harness) {
      const override = statusOverride?.[harness];
      if (override) return override;
      return harness === 'codex'
        ? {
            ...status(`Codex refresh ${refreshes++}`),
            harness: 'codex',
            displayName: 'Codex',
            targets: manyCodexTargets(),
            disclaimers: [
              {
                message:
                  'Codex root orchestration remains ambient instructions.',
              },
            ],
          }
        : status(`OpenCode refresh ${refreshes++}`);
    },
    async modelOptions(harness) {
      const override = modelOptionsOverride?.[harness];
      if (override) return await override;
      return harness === 'codex'
        ? [
            modelOption('gpt-5.2', ['low', 'high']),
            modelOption('gpt-4o'),
            modelOption('o3-pro'),
          ]
        : [modelOption('openai/gpt-5.2', ['low', 'high'])];
    },
    modelRoles(harness) {
      const override = modelRolesOverride?.[harness];
      if (override) return override;
      if (harness === 'codex') {
        return [
          { role: 'explorer', model: 'gpt-5.3-codex-spark' },
          { role: 'librarian', model: 'gpt-5.4-mini' },
          { role: 'oracle', model: 'gpt-5.5' },
          { role: 'designer', model: 'gpt-5.4-mini' },
          { role: 'quick', model: 'gpt-5.4-mini' },
          { role: 'deep', model: 'gpt-5.5' },
        ];
      }
      return [
        { role: 'orchestrator', model: 'openai/gpt-5.4' },
        { role: 'explorer', model: 'openai/gpt-5.4-mini' },
        { role: 'librarian', model: 'openai/gpt-5.4-mini' },
        { role: 'oracle', model: 'openai/gpt-5.4' },
        { role: 'designer', model: 'openai/gpt-5.4-mini' },
        { role: 'quick', model: 'openai/gpt-5.4-mini' },
        { role: 'deep', model: 'openai/gpt-5.4' },
      ];
    },
    plan(_harness, action) {
      planned.push({ harness: _harness, action });
      return { ...plan(action), harness: _harness };
    },
    modelPlan(_harness, roles) {
      modelPlanRoles.push([...roles]);
      return plan('model', roles);
    },
    apply(operationPlan): OperationApplyResult {
      applied.push(operationPlan);
      return {
        harness: operationPlan.harness,
        action: operationPlan.action,
        applied: true,
        summary: 'Applied test plan.',
        changedTargets: operationPlan.targets,
        backups: [],
        warnings: [],
        disclaimers: [],
      };
    },
  };
}

function missingStatus(harness: 'codex' | 'opencode'): HarnessStatusReport {
  return {
    ...status(`${harness} missing`),
    harness,
    displayName: harness === 'codex' ? 'Codex' : 'OpenCode',
    state: 'missing',
    summary: `${harness} setup is missing.`,
    targets: [
      {
        kind: 'config',
        label: `${harness} config`,
        state: 'missing',
        observed: 'absent',
      },
    ],
  };
}

function longOpenCodeModelOptions(): ModelOption[] {
  return Array.from({ length: 12 }, (_, index) =>
    modelOption(`openai/gpt-page-${index + 1}`),
  );
}

function modelOption(id: string, efforts: readonly string[] = []): ModelOption {
  return {
    id,
    catalogId: id.includes('/') ? id : `openai/${id}`,
    label: id,
    provider: 'openai',
    efforts,
    source: 'remote',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushInk(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

async function press(
  stdin: { write(input: string): void },
  input: string,
): Promise<void> {
  stdin.write(input);
  await flushInk();
}

async function openStatus(stdin: { write(input: string): void }) {
  await press(stdin, '\r');
  await press(stdin, '\r');
}

async function openUpdatePreview(stdin: { write(input: string): void }) {
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, '\r');
  await press(stdin, '\r');
  await press(stdin, '\r');
}

async function openCodexModels(stdin: { write(input: string): void }) {
  await openManageCodex(stdin);
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, '\r');
}

async function openOpenCodeModels(stdin: { write(input: string): void }) {
  await press(stdin, 'j');
  await press(stdin, '\r');
  await press(stdin, '\r');
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, '\r');
}

async function openClaudeModels(stdin: { write(input: string): void }) {
  await press(stdin, 'j');
  await press(stdin, '\r');
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, '\r');
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, '\r');
}

async function dirtyExplorer(stdin: { write(input: string): void }) {
  await openCodexModels(stdin);
  await press(stdin, '\r');
  await press(stdin, 'j');
  await press(stdin, '\r');
  await press(stdin, '\r');
}

async function manualExplorer(stdin: { write(input: string): void }) {
  await openCodexModels(stdin);
  await press(stdin, '\r');
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, '\r');
  await press(stdin, 'manual-model');
  await press(stdin, '\r');
  await press(stdin, '\r');
}

async function openManageCodex(stdin: { write(input: string): void }) {
  await press(stdin, 'j');
  await press(stdin, '\r');
  await press(stdin, 'j');
  await press(stdin, '\r');
}

describe('interactive TUI', () => {
  test('TUI root menu groups actions and exposes Exit', () => {
    const { lastFrame } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    expect(lastFrame()).toContain('Status');
    expect(lastFrame()).toContain('Manage Harnesses');
    expect(lastFrame()).toContain('Sync / Update');
    expect(lastFrame()).toContain('Exit');
    expect(lastFrame()).not.toContain('Configure Models');
    expect(lastFrame()).not.toContain('OpenCode Status');
    expect(lastFrame()).not.toContain('Codex Status');
    expect(lastFrame()).toMatchSnapshot();
  });

  test('TUI Status opens a harness/status flow', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await press(stdin, '\r');
    expect(lastFrame()).toContain('Choose a harness.');
    expect(lastFrame()).toContain('OpenCode');

    await press(stdin, '\r');
    expect(lastFrame()).toContain('OpenCode Status');
    expect(lastFrame()).toContain('OpenCode refresh 0');
    expect(lastFrame()).toContain('Config');
    expect(lastFrame()).toContain('OpenCode Config: [installed]');
  });

  test('TUI compact Codex status shows categorized labels without path dump', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await press(stdin, '\r');
    await press(stdin, 'j');
    await press(stdin, '\r');

    expect(lastFrame()).toContain('Codex Status');
    expect(lastFrame()).toContain('Skills');
    expect(lastFrame()).toContain('SDD-Archive: [installed]');
    expect(lastFrame()).toContain('Agents');
    expect(lastFrame()).toContain('Designer: [installed]');
    expect(lastFrame()).toContain('Plugin/MCP');
    expect(lastFrame()).toContain('Marketplace');
    expect(lastFrame()).toContain('Root instructions');
    expect(lastFrame()).not.toContain('C:\\Users\\EremesNG');
    expect(lastFrame()).not.toContain('skills\\sdd-archive\\SKILL.md');
  });

  test('TUI compact OpenCode status groups skills with concise labels', async () => {
    const { lastFrame, stdin } = render(
      <App
        operations={operations(undefined, {
          opencode: opencodeStatusWithSkills(),
        })}
        exitOnQuit={false}
      />,
    );

    await openStatus(stdin);

    expect(lastFrame()).toContain('OpenCode Status');
    expect(lastFrame()).toContain('Skills');
    expect(lastFrame()).toContain('Simplify: [installed]');
    expect(lastFrame()).toContain('Playwright-CLI: [missing]');
    expect(lastFrame()).not.toContain('C:\\Users\\EremesNG');
    expect(lastFrame()).not.toContain(
      '.agents\\skills\\playwright-cli\\SKILL.md',
    );
  });

  test('TUI blocked status renders diagnostic codes and target observations', async () => {
    const blockedStatus: HarnessStatusReport = {
      ...status('OpenCode managed health is blocked.'),
      state: 'drift',
      targets: [
        {
          kind: 'config',
          label: 'thoth-agents config',
          state: 'drift',
          observed: 'preset: agents; roles: 7/7',
        },
        {
          kind: 'skill',
          label: 'Bundled skill: sdd-apply',
          state: 'missing',
          observed: 'managed bundled skill missing',
        },
      ],
      diagnostics: [
        {
          severity: 'important',
          code: 'opencode-roster-drift',
          message: 'Managed OpenCode roster uses the legacy agents preset.',
        },
        {
          severity: 'important',
          code: 'opencode-bundled-skills-missing',
          message: 'Bundled thoth-agents OpenCode skills are missing.',
        },
      ],
    };
    const { lastFrame, stdin } = render(
      <App
        operations={operations(undefined, { opencode: blockedStatus })}
        exitOnQuit={false}
      />,
    );

    await openStatus(stdin);

    expect(lastFrame()).toContain(
      'Thoth Agents Config: [drift] - preset: agents; roles: 7/7',
    );
    expect(lastFrame()).toContain(
      'Bundled skill: sdd-apply: [missing] - managed bundled skill missing',
    );
    expect(lastFrame()).toContain(
      '[important] [opencode-roster-drift] Managed OpenCode roster uses the legacy agents preset.',
    );
    expect(lastFrame()).toContain(
      '[important] [opencode-bundled-skills-missing] Bundled thoth-agents OpenCode skills are missing.',
    );
  });

  test('Manage Codex exposes actionable entries and navigates', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await openManageCodex(stdin);
    expect(lastFrame()).toContain('Manage Codex');
    expect(lastFrame()).toContain('View status');
    expect(lastFrame()).toContain('Update preview');
    expect(lastFrame()).toContain('Sync preview');
    expect(lastFrame()).toContain('Configure models');

    await press(stdin, 'j');
    await press(stdin, '\r');
    expect(lastFrame()).toContain('Preview update');
    await press(stdin, 'c');
    await press(stdin, 'j');
    await press(stdin, 'j');
    await press(stdin, '\r');
    expect(lastFrame()).toContain('Codex Models');
  });

  test('Manage missing OpenCode shows Install as primary action', async () => {
    const ops = operations(undefined, { opencode: missingStatus('opencode') });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await press(stdin, 'j');
    await press(stdin, '\r');
    await press(stdin, '\r');

    expect(lastFrame()).toContain('Manage OpenCode');
    expect(lastFrame()).toContain('Install');
    expect(lastFrame()).toContain('Back');
    expect(lastFrame()).not.toContain('Update preview');
    expect(lastFrame()).not.toContain('Sync preview');

    await press(stdin, '\r');
    expect(ops.planned.at(-1)).toEqual({
      harness: 'opencode',
      action: 'install',
    });
    expect(lastFrame()).toContain('Preview install');
  });

  test('Manage installed OpenCode does not show Install by default', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await press(stdin, 'j');
    await press(stdin, '\r');
    await press(stdin, '\r');

    expect(lastFrame()).toContain('Manage OpenCode');
    expect(lastFrame()).not.toContain('Install');
    expect(lastFrame()).toContain('Update preview');
    expect(lastFrame()).toContain('Sync preview');
  });

  test('Manage missing Codex routes Install to Codex install plan', async () => {
    const ops = operations(undefined, { codex: missingStatus('codex') });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openManageCodex(stdin);

    expect(lastFrame()).toContain('Manage Codex');
    expect(lastFrame()).toContain('Install');
    expect(lastFrame()).not.toContain('Update preview');

    await press(stdin, '\r');
    expect(ops.planned.at(-1)).toEqual({
      harness: 'codex',
      action: 'install',
    });
    expect(lastFrame()).toContain('Preview install');
  });

  test('TUI Sync / Update supports nested action and harness selection', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await openUpdatePreview(stdin);

    expect(lastFrame()).toContain('Preview update');
    expect(lastFrame()).toContain('No writes until explicit apply.');
  });

  test('TUI blocked plan renders diagnostic codes and target observations', async () => {
    const blockerTargets: OperationPlan['targets'] = [
      {
        kind: 'config',
        label: 'thoth-agents config',
        state: 'drift',
        observed: 'preset: agents; roles: 7/7',
      },
      {
        kind: 'skill',
        label: 'Bundled skill: sdd-apply',
        state: 'missing',
        observed: 'managed bundled skill missing',
      },
    ];
    const blockedPlan: OperationPlan = {
      ...plan('update'),
      canApply: false,
      targets: blockerTargets,
      blockerTargets,
      warnings: [
        {
          severity: 'important',
          code: 'opencode-roster-drift',
          message: 'Managed OpenCode roster uses the legacy agents preset.',
        },
        {
          severity: 'important',
          code: 'opencode-bundled-skills-missing',
          message: 'Bundled thoth-agents OpenCode skills are missing.',
        },
      ],
    };
    const ops = {
      ...operations(),
      plan: () => blockedPlan,
    };
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openUpdatePreview(stdin);

    expect(lastFrame()).toContain(
      'thoth-agents config: [drift] - preset: agents; roles: 7/7',
    );
    expect(lastFrame()).toContain(
      'Bundled skill: sdd-apply: [missing] - managed bundled skill missing',
    );
    expect(lastFrame()).toContain(
      '[important] [opencode-roster-drift] Managed OpenCode roster uses the legacy agents preset.',
    );
    expect(lastFrame()).toContain(
      '[important] [opencode-bundled-skills-missing] Bundled thoth-agents OpenCode skills are missing.',
    );
  });

  test('TUI blocker targets exclude missing optional recommended skills', async () => {
    const managedBlocker: OperationPlan['targets'][number] = {
      kind: 'config',
      label: 'thoth-agents config',
      state: 'drift',
      observed: 'preset: agents; roles: 7/7',
    };
    const optionalRecommendation: OperationPlan['targets'][number] = {
      kind: 'skill',
      label: 'Playwright-CLI',
      state: 'missing',
      observed: 'recommended global skill missing',
    };
    const blockedPlan: OperationPlan = {
      ...plan('update'),
      canApply: false,
      targets: [managedBlocker, optionalRecommendation],
      blockerTargets: [managedBlocker],
    };
    const ops = {
      ...operations(),
      plan: () => blockedPlan,
    };
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openUpdatePreview(stdin);

    expect(lastFrame()).toContain('Blocker targets');
    expect(lastFrame()).toContain(
      'thoth-agents config: [drift] - preset: agents; roles: 7/7',
    );
    expect(lastFrame()).not.toContain('Playwright-CLI');
    expect(lastFrame()).not.toContain('recommended global skill missing');
  });

  test('TUI failed apply renders result diagnostic codes and target observations', async () => {
    const blockedResult: OperationApplyResult = {
      harness: 'opencode',
      action: 'update',
      applied: false,
      summary: 'OpenCode apply is blocked by managed health.',
      changedTargets: [],
      diagnosticTargets: [
        {
          kind: 'config',
          label: 'thoth-agents config',
          state: 'drift',
          observed: 'preset: agents; roles: 7/7',
        },
      ],
      backups: [],
      warnings: [
        {
          severity: 'important',
          code: 'opencode-roster-drift',
          message: 'Managed OpenCode roster uses the legacy agents preset.',
        },
      ],
      disclaimers: [],
    };
    const ops = {
      ...operations(),
      apply: () => blockedResult,
    };
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openUpdatePreview(stdin);
    await press(stdin, 'a');

    expect(lastFrame()).toContain('Apply diagnostics');
    expect(lastFrame()).toContain(
      'thoth-agents config: [drift] - preset: agents; roles: 7/7',
    );
    expect(lastFrame()).toContain(
      '[important] [opencode-roster-drift] Managed OpenCode roster uses the legacy agents preset.',
    );
  });

  test('TUI status refresh reads operation data again', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await openStatus(stdin);
    expect(lastFrame()).toContain('OpenCode refresh 0');
    await press(stdin, 'r');
    expect(lastFrame()).toContain('OpenCode refresh 1');
  });

  test('TUI preview cancellation returns one level without applying', async () => {
    const ops = operations();
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openUpdatePreview(stdin);
    await press(stdin, 'c');

    expect(lastFrame()).toContain('Choose a harness.');
    expect(ops.applied).toHaveLength(0);
  });

  test('TUI preview requires explicit apply', async () => {
    const ops = operations();
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openUpdatePreview(stdin);
    await press(stdin, 'a');

    expect(ops.applied).toHaveLength(1);
    expect(lastFrame()).toContain('Applied test plan.');
  });

  test('Configure Models -> Codex lists roles with current models', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);

    expect(lastFrame()).toContain('Codex Models');
    for (const note of codexModelCatalogNote) {
      expect(lastFrame()).toContain(note);
    }
    expect(lastFrame()).toContain('explorer: gpt-5.3-codex-spark');
    expect(lastFrame()).toContain('deep: gpt-5.5');
  });

  test('model catalog loading and failure stay visible without blocking manual entry', async () => {
    const pending = deferred<ModelOption[]>();
    const ops = operations({ codex: pending.promise });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    expect(lastFrame()).toContain('Loading model catalog');

    pending.reject(new Error('catalog offline'));
    await flushInk();
    expect(lastFrame()).toContain(
      'Could not load model catalog: catalog offline',
    );

    await press(stdin, '\r');
    expect(lastFrame()).toContain('Manual entry');
  });

  test('current model is initially selected when its exact catalog option is later', async () => {
    const current = modelOption('gpt-5.6-luna', ['xhigh', 'max']);
    const ops = operations(
      { codex: [modelOption('gpt-5.6'), current] },
      undefined,
      { codex: [{ role: 'explorer', model: current.id }] },
    );
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    await flushInk();
    await press(stdin, '\r');

    expect(lastFrame()).toContain('> gpt-5.6-luna - openai');
    expect(lastFrame()).toContain('Enter to continue to effort');

    await press(stdin, '\r');
    expect(lastFrame()).toContain('Choose explorer effort');
    expect(lastFrame()).toContain('Model: gpt-5.6-luna');
    expect(lastFrame()).toContain('xhigh');
    expect(lastFrame()).toContain('max');
  });

  test('Claude keeps haiku as the initial model choice', async () => {
    const base = operations();
    const ops: TuiOperations = {
      ...base,
      status(harness) {
        if (harness !== 'claude') return base.status(harness);
        return {
          ...status('Claude Code ready'),
          harness: 'claude',
          displayName: 'Claude Code',
        };
      },
      modelOptions(harness) {
        if (harness !== 'claude') return base.modelOptions(harness);
        return Promise.resolve([
          modelOption('sonnet', ['high']),
          modelOption('opus', ['high']),
          modelOption('haiku', ['low', 'medium']),
        ]);
      },
      modelRoles(harness) {
        if (harness !== 'claude') return base.modelRoles(harness);
        return [{ role: 'explorer', model: 'haiku' }];
      },
    };
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openClaudeModels(stdin);
    await flushInk();
    await press(stdin, '\r');

    expect(lastFrame()).toContain('> haiku - openai');
    await press(stdin, '\r');
    expect(lastFrame()).toContain('Model: haiku');
    expect(lastFrame()).toContain('medium');
  });

  test('current model absent from the catalog is preserved with inherit only', async () => {
    const ops = operations(
      { codex: [modelOption('gpt-5.6', ['high'])] },
      undefined,
      { codex: [{ role: 'explorer', model: 'gpt-private' }] },
    );
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    await flushInk();
    await press(stdin, '\r');

    expect(lastFrame()).toContain('> gpt-private');
    await press(stdin, '\r');
    expect(lastFrame()).toContain('Model: gpt-private');
    expect(lastFrame()).toContain('No explicit effort options');
    expect(lastFrame()).toContain('inherit');
  });

  test('async catalog arrival keeps the current model selected', async () => {
    const pending = deferred<ModelOption[]>();
    const current = modelOption('gpt-5.6-luna', ['high']);
    const ops = operations({ codex: pending.promise }, undefined, {
      codex: [{ role: 'explorer', model: current.id }],
    });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    await press(stdin, '\r');
    expect(lastFrame()).toContain('> gpt-5.6-luna');

    pending.resolve([modelOption('gpt-5.6'), current]);
    await flushInk();
    expect(lastFrame()).toContain('> gpt-5.6-luna - openai');

    await press(stdin, '\r');
    expect(lastFrame()).toContain('Model: gpt-5.6-luna');
    expect(lastFrame()).toContain('high');
  });

  test('manual model clears exact catalog metadata before and after apply', async () => {
    const current = modelOption('gpt-5.6-luna', ['high']);
    const manualModel = `${current.id}-manual`;
    const ops = operations({ codex: [current] }, undefined, {
      codex: [
        {
          role: 'explorer',
          model: current.id,
          provider: current.provider,
          catalogId: current.catalogId,
          availableEfforts: current.efforts,
          effort: { kind: 'effort', value: 'high' },
        },
      ],
    });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    await flushInk();
    await press(stdin, '\r');
    await press(stdin, 'j');
    await press(stdin, '\r');
    await press(stdin, '-manual');
    await press(stdin, '\r');

    expect(lastFrame()).toContain(`Model: ${manualModel}`);
    expect(lastFrame()).toContain('No explicit effort options');
    await press(stdin, '\r');

    await press(stdin, '\r');
    await press(stdin, '\r');
    expect(lastFrame()).toContain(`Model: ${manualModel}`);
    expect(lastFrame()).toContain('No explicit effort options');
    expect(lastFrame()).not.toContain('\n  high');
    await press(stdin, '\r');

    await press(stdin, 'j');
    await press(stdin, 'j');
    await press(stdin, '\r');

    expect(ops.modelPlanRoles.at(-1)).toEqual([
      {
        role: 'explorer',
        model: manualModel,
        effort: { kind: 'inherit' },
      },
    ]);

    await press(stdin, 'k');
    await press(stdin, 'k');
    await press(stdin, '\r');
    await press(stdin, '\r');
    expect(lastFrame()).toContain(`Model: ${manualModel}`);
    expect(lastFrame()).toContain('No explicit effort options');
    expect(lastFrame()).not.toContain('\n  high');
  });

  test('Escape from manual effort returns to the manual draft without catalog efforts', async () => {
    const current = modelOption('gpt-5.6-luna', ['high']);
    const manualModel = 'gpt-5.6-luna-manual';
    const ops = operations({ codex: [current] }, undefined, {
      codex: [{ role: 'explorer', model: current.id }],
    });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    await flushInk();
    await press(stdin, '\r');
    await press(stdin, 'j');
    await press(stdin, '\r');
    await press(stdin, '-manual');
    await press(stdin, '\r');

    expect(lastFrame()).toContain(`Model: ${manualModel}`);
    expect(lastFrame()).toContain('No explicit effort options');

    await press(stdin, '\u001B');
    expect(lastFrame()).toContain('Choose explorer model');
    expect(lastFrame()).toContain(`> ${manualModel}`);
    expect(lastFrame()).not.toContain('> Manual entry');

    await press(stdin, '\r');
    expect(lastFrame()).toContain('Choose explorer effort');
    expect(lastFrame()).toContain(`Model: ${manualModel}`);
    expect(lastFrame()).toContain('No explicit effort options');
    expect(lastFrame()).not.toContain('\n  high');
  });

  test('Manual entry remains selected when async catalog options arrive', async () => {
    const pending = deferred<ModelOption[]>();
    const ops = operations({ codex: pending.promise }, undefined, {
      codex: [{ role: 'explorer', model: 'gpt-current' }],
    });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    await press(stdin, '\r');
    await press(stdin, 'j');
    expect(lastFrame()).toContain('> Manual entry');

    pending.resolve([modelOption('gpt-other-1'), modelOption('gpt-other-2')]);
    await flushInk();

    expect(lastFrame()).toContain('> Manual entry');
    await press(stdin, '\r');
    expect(lastFrame()).toContain('Edit explorer');
    expect(lastFrame()).toContain('New: gpt-current');
  });

  test('model selection is followed by effort selection with inherit and supported values only', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    await flushInk();
    await press(stdin, '\r');
    await press(stdin, 'j');
    await press(stdin, '\r');

    expect(lastFrame()).toContain('Choose explorer effort');
    expect(lastFrame()).toContain('inherit');
    expect(lastFrame()).toContain('low');
    expect(lastFrame()).toContain('high');
    expect(lastFrame()).not.toContain('toggle');
    expect(lastFrame()).not.toContain('budget_tokens');
  });

  test('effort-only edits are dirty and included in model plans', async () => {
    const current = modelOption('gpt-5.3-codex-spark', ['high']);
    const ops = operations({ codex: [current] }, undefined, {
      codex: [{ role: 'explorer', model: current.id }],
    });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    await flushInk();
    await press(stdin, '\r');
    await press(stdin, '\r');
    await press(stdin, 'j');
    await press(stdin, '\r');

    expect(lastFrame()).toContain('*explorer: gpt-5.3-codex-spark');
    expect(lastFrame()).toContain('effort high');

    await press(stdin, 'j');
    await press(stdin, 'j');
    await press(stdin, '\r');
    expect(ops.modelPlanRoles.at(-1)).toEqual([
      expect.objectContaining({
        role: 'explorer',
        model: 'gpt-5.3-codex-spark',
        effort: { kind: 'effort', value: 'high' },
        availableEfforts: ['high'],
      }),
    ]);
  });

  test('changing model resets an incompatible pending effort to inherit', async () => {
    const ops = operations(
      { codex: [modelOption('gpt-5.2', ['low'])] },
      undefined,
      {
        codex: [
          {
            role: 'explorer',
            model: 'gpt-5.5',
            effort: { kind: 'effort', value: 'high' },
          },
        ],
      },
    );
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    await flushInk();
    await press(stdin, '\r');
    await press(stdin, 'j');
    await press(stdin, '\r');

    expect(lastFrame()).toContain('New effort: inherit');
    expect(lastFrame()).not.toContain('\n  high');
  });

  test('models without effort capability still offer inherit only', async () => {
    const ops = operations({ codex: [modelOption('gpt-5.2')] });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    await flushInk();
    await press(stdin, '\r');
    await press(stdin, 'j');
    await press(stdin, '\r');

    expect(lastFrame()).toContain('No explicit effort options');
    expect(lastFrame()).toContain('inherit');
  });

  test('Configure Models -> OpenCode does not show the Codex model note', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await openOpenCodeModels(stdin);

    expect(lastFrame()).toContain('OpenCode Models');
    for (const note of codexModelCatalogNote) {
      expect(lastFrame()).not.toContain(note);
    }
  });

  test('changing a Codex role marks it dirty', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await dirtyExplorer(stdin);

    expect(lastFrame()).toContain('*explorer: gpt-5.2');
    expect(lastFrame()).toContain('(was gpt-5.3-codex-spark · effort inherit)');
  });

  test('OpenCode model picker can select beyond the first visible page', async () => {
    const ops = operations({ opencode: longOpenCodeModelOptions() });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openOpenCodeModels(stdin);
    await press(stdin, '\r');
    for (let index = 0; index < 11; index += 1) await press(stdin, 'j');
    expect(lastFrame()).toContain('openai/gpt-page-11');
    await press(stdin, '\r');
    await press(stdin, '\r');

    expect(lastFrame()).toContain('*orchestrator: openai/gpt-page-11');
  });

  test('Manual entry remains reachable after long OpenCode catalog options', async () => {
    const ops = operations({ opencode: longOpenCodeModelOptions() });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openOpenCodeModels(stdin);
    await press(stdin, '\r');
    for (let index = 0; index < 13; index += 1) await press(stdin, 'j');
    expect(lastFrame()).toContain('> Manual entry');
    await press(stdin, '\r');
    await press(stdin, 'manual-opencode-model');
    await press(stdin, '\r');
    await press(stdin, '\r');

    expect(lastFrame()).toContain(
      '*orchestrator: openai/gpt-5.4manual-opencode-model',
    );
  });

  test('manual model entry marks a role dirty', async () => {
    const ops = operations();
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await manualExplorer(stdin);

    expect(lastFrame()).toContain('*explorer: gpt-5.3-codex-sparkmanual-model');
    for (let index = 0; index < 6; index += 1) await press(stdin, 'j');
    await press(stdin, '\r');
    const planned = ops.modelPlanRoles.at(-1);
    expect(planned).toEqual([
      {
        role: 'explorer',
        model: 'gpt-5.3-codex-sparkmanual-model',
      },
    ]);
    expect(JSON.stringify(planned)).not.toContain('toggle');
    expect(JSON.stringify(planned)).not.toContain('budget_tokens');
  });

  test('model preview only includes changed roles', async () => {
    const ops = operations();
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await dirtyExplorer(stdin);
    for (let index = 0; index < 6; index += 1) await press(stdin, 'j');
    await press(stdin, '\r');

    expect(ops.modelPlanRoles.at(-1)).toEqual([
      { role: 'explorer', model: 'gpt-5.2' },
    ]);
    expect(lastFrame()).toContain('Set explorer model');
    expect(lastFrame()).not.toContain('Set librarian model');
  });

  test('model apply only applies changed roles', async () => {
    const ops = operations();
    const { stdin } = render(<App operations={ops} exitOnQuit={false} />);

    await dirtyExplorer(stdin);
    for (let index = 0; index < 7; index += 1) await press(stdin, 'j');
    await press(stdin, '\r');

    expect(ops.modelPlanRoles.at(-1)).toEqual([
      { role: 'explorer', model: 'gpt-5.2' },
    ]);
    expect(ops.applied[0]?.items).toHaveLength(1);
  });

  test('Escape returns one level and Exit is selectable', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await openCodexModels(stdin);
    await press(stdin, '\u001B');
    expect(lastFrame()).toContain('Manage Codex');
    await press(stdin, '\u001B');
    expect(lastFrame()).toContain('Choose a harness.');
    await press(stdin, '\u001B');
    expect(lastFrame()).toContain('Interactive setup');

    for (let index = 0; index < 2; index += 1) await press(stdin, 'j');
    expect(lastFrame()).toContain('> Exit');
  });

  test('TUI status does not render long paths by default', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await openStatus(stdin);

    expect(lastFrame()).not.toContain('C:\\Users\\EremesNG');
    expect(lastFrame()).toContain('OpenCode Config: [installed]');
  });
});
