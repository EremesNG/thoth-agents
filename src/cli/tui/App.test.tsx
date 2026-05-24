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
  modelOptionsOverride?: Partial<Record<'codex' | 'opencode', ModelOption[]>>,
  statusOverride?: Partial<Record<'codex' | 'opencode', HarnessStatusReport>>,
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
    modelOptions(harness) {
      const override = modelOptionsOverride?.[harness];
      if (override) return override;
      return harness === 'codex'
        ? [
            { id: 'gpt-5.2', label: 'GPT-5.2', provider: 'openai' },
            { id: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
            { id: 'o3-pro', label: 'o3-pro', provider: 'openai' },
          ]
        : [
            {
              id: 'openai/gpt-5.2',
              label: 'GPT-5.2',
              provider: 'openai',
            },
          ];
    },
    modelRoles(harness) {
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
  return Array.from({ length: 12 }, (_, index) => ({
    id: `openai/gpt-page-${index + 1}`,
    label: `GPT page ${index + 1}`,
    provider: 'openai',
  }));
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

async function dirtyExplorer(stdin: { write(input: string): void }) {
  await openCodexModels(stdin);
  await press(stdin, '\r');
  await press(stdin, '\r');
}

async function manualExplorer(stdin: { write(input: string): void }) {
  await openCodexModels(stdin);
  await press(stdin, '\r');
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, 'j');
  await press(stdin, '\r');
  await press(stdin, 'manual-model');
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
    expect(lastFrame()).toContain('(was gpt-5.3-codex-spark)');
  });

  test('OpenCode model picker can select beyond the first visible page', async () => {
    const ops = operations({ opencode: longOpenCodeModelOptions() });
    const { lastFrame, stdin } = render(
      <App operations={ops} exitOnQuit={false} />,
    );

    await openOpenCodeModels(stdin);
    await press(stdin, '\r');
    for (let index = 0; index < 10; index += 1) await press(stdin, 'j');
    expect(lastFrame()).toContain('openai/gpt-page-11');
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
    for (let index = 0; index < 12; index += 1) await press(stdin, 'j');
    expect(lastFrame()).toContain('> Manual entry');
    await press(stdin, '\r');
    await press(stdin, 'manual-opencode-model');
    await press(stdin, '\r');

    expect(lastFrame()).toContain(
      '*orchestrator: openai/gpt-5.4manual-opencode-model',
    );
  });

  test('manual model entry marks a role dirty', async () => {
    const { lastFrame, stdin } = render(
      <App operations={operations()} exitOnQuit={false} />,
    );

    await manualExplorer(stdin);

    expect(lastFrame()).toContain('*explorer: gpt-5.3-codex-sparkmanual-model');
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
