import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  applyClaudeCodeManagedModelOverrides,
  applyClaudeCodeSetup,
  buildClaudeCodeSetupPlan,
  isClaudeCodeModelAlias,
  parseSubagentEffort,
  parseSubagentModel,
  replaceSubagentEffort,
  replaceSubagentModel,
} from './claude-code-install';

let home: string;

function config(overrides: { dryRun?: boolean; reset?: boolean } = {}) {
  return {
    dryRun: overrides.dryRun ?? false,
    reset: overrides.reset ?? false,
    scope: 'user' as const,
    projectRoot: process.cwd(),
    homeDir: home,
  };
}

function pluginRoot(): string {
  return join(home, '.claude', 'skills', 'thoth-agents');
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'cc-install-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('claude-code-install', () => {
  test('frontmatter model helpers parse and replace', () => {
    const content = '---\nname: deep\nmodel: opus\ntools: Read\n---\nbody';
    expect(parseSubagentModel(content)).toBe('opus');
    expect(parseSubagentModel(replaceSubagentModel(content, 'haiku'))).toBe(
      'haiku',
    );
  });

  test('frontmatter effort helpers add, replace, and remove without changing body', () => {
    const content = '---\nname: deep\nmodel: opus\ntools: Read\n---\nbody';
    const added = replaceSubagentEffort(content, 'high');
    expect(parseSubagentEffort(added)).toBe('high');
    expect(added).toContain('tools: Read\n---\nbody');

    const replaced = replaceSubagentEffort(added, 'max');
    expect(parseSubagentEffort(replaced)).toBe('max');
    expect(replaceSubagentEffort(replaced, undefined)).toBe(content);
  });

  test('model alias guard rejects arbitrary models', () => {
    expect(isClaudeCodeModelAlias('opus')).toBe(true);
    expect(isClaudeCodeModelAlias('inherit')).toBe(true);
    expect(isClaudeCodeModelAlias('gpt-5.4')).toBe(false);
  });

  test('dry-run setup plan writes nothing', () => {
    const plan = buildClaudeCodeSetupPlan(config({ dryRun: true }));
    const result = applyClaudeCodeSetup(plan);
    expect(result.success).toBe(true);
    expect(result.changed).toEqual([]);
    expect(existsSync(pluginRoot())).toBe(false);
  });

  test('apply writes the plugin package and is idempotent with backups', () => {
    const first = applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config()));
    expect(first.success).toBe(true);
    expect(first.changed.length).toBeGreaterThan(0);
    expect(
      existsSync(join(pluginRoot(), '.claude-plugin', 'plugin.json')),
    ).toBe(true);
    expect(existsSync(join(pluginRoot(), 'agents', 'deep.md'))).toBe(true);
    expect(existsSync(join(pluginRoot(), 'agents', 'orchestrator.md'))).toBe(
      true,
    );
    expect(existsSync(join(pluginRoot(), '.mcp.json'))).toBe(true);
    expect(existsSync(join(pluginRoot(), 'settings.json'))).toBe(true);

    // Re-apply: identical content is skipped (no changes, no backups).
    const second = applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config()));
    expect(second.changed).toEqual([]);
    expect(existsSync(join(pluginRoot(), 'agents', 'deep.md.bak'))).toBe(false);
  });

  test('setup preserves installed effort and treats an absent field as inherit', () => {
    applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config()));
    const deepPath = join(pluginRoot(), 'agents', 'deep.md');
    const explorerPath = join(pluginRoot(), 'agents', 'explorer.md');
    writeFileSync(
      deepPath,
      replaceSubagentEffort(readFileSync(deepPath, 'utf8'), 'high'),
    );
    writeFileSync(
      explorerPath,
      replaceSubagentEffort(readFileSync(explorerPath, 'utf8'), undefined),
    );
    const statePath = join(pluginRoot(), '.thoth-agents-managed-models.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.configuredEfforts = { explorer: 'max' };
    writeFileSync(statePath, JSON.stringify(state, null, 2));

    applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config()));

    expect(parseSubagentEffort(readFileSync(deepPath, 'utf8'))).toBe('high');
    expect(
      parseSubagentEffort(readFileSync(explorerPath, 'utf8')),
    ).toBeUndefined();
  });

  test('model-only Claude override preserves installed effort until explicitly cleared', () => {
    applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config()));
    const deepPath = join(pluginRoot(), 'agents', 'deep.md');
    writeFileSync(
      deepPath,
      replaceSubagentEffort(readFileSync(deepPath, 'utf8'), 'high'),
    );

    expect(
      applyClaudeCodeManagedModelOverrides(config(), [
        { role: 'deep', model: 'opus' },
      ]).success,
    ).toBe(true);
    expect(parseSubagentEffort(readFileSync(deepPath, 'utf8'))).toBe('high');

    expect(
      applyClaudeCodeManagedModelOverrides(config(), [
        { role: 'deep', model: 'opus', clearEffort: true },
      ]).success,
    ).toBe(true);
    expect(parseSubagentEffort(readFileSync(deepPath, 'utf8'))).toBeUndefined();
  });

  test('managed model override updates frontmatter and persists state', () => {
    applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config()));

    const result = applyClaudeCodeManagedModelOverrides(config(), [
      { role: 'explorer', model: 'haiku' },
    ]);
    expect(result.success).toBe(true);

    const explorer = readFileSync(
      join(pluginRoot(), 'agents', 'explorer.md'),
      'utf8',
    );
    expect(parseSubagentModel(explorer)).toBe('haiku');

    const state = JSON.parse(
      readFileSync(
        join(pluginRoot(), '.thoth-agents-managed-models.json'),
        'utf8',
      ),
    ) as { configuredModels?: Record<string, string> };
    expect(state.configuredModels?.explorer).toBe('haiku');

    // A subsequent setup plan re-applies the configured override.
    const replan = buildClaudeCodeSetupPlan(config());
    const explorerItem = replan.items.find((item) => item.role === 'explorer');
    expect(parseSubagentModel(String(explorerItem?.content))).toBe('haiku');
  });

  test('manual concrete model-only override survives regeneration without excluded controls', () => {
    applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config()));
    const model = 'anthropic/claude-opus-4.6';

    const result = applyClaudeCodeManagedModelOverrides(config(), [
      { role: 'deep', model, catalogId: model },
    ]);
    expect(result.success).toBe(true);
    applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config()));

    const output = readFileSync(
      join(pluginRoot(), 'agents', 'deep.md'),
      'utf8',
    );
    expect(parseSubagentModel(output)).toBe(model);
    expect(parseSubagentEffort(output)).toBeUndefined();
    expect(output).not.toContain('toggle');
    expect(output).not.toContain('budget_tokens');
  });

  test('managed effort override updates frontmatter and persists state', () => {
    applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config()));

    const result = applyClaudeCodeManagedModelOverrides(config(), [
      { role: 'deep', model: 'opus', effort: 'max' },
    ]);
    expect(result.success).toBe(true);

    const deep = readFileSync(join(pluginRoot(), 'agents', 'deep.md'), 'utf8');
    expect(parseSubagentEffort(deep)).toBe('max');
    const state = JSON.parse(
      readFileSync(
        join(pluginRoot(), '.thoth-agents-managed-models.json'),
        'utf8',
      ),
    ) as { configuredEfforts?: Record<string, string> };
    expect(state.configuredEfforts?.deep).toBe('max');
  });

  test('rejects unsupported model aliases on override', () => {
    applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config()));
    const result = applyClaudeCodeManagedModelOverrides(config(), [
      { role: 'deep', model: 'gpt-5.4' as never },
    ]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported Claude Code model');
  });

  test('managed default tracking does not drift across repeated overrides', () => {
    applyClaudeCodeSetup(buildClaudeCodeSetupPlan(config()));

    // explorer's rendered default is 'haiku'. Override twice.
    applyClaudeCodeManagedModelOverrides(config(), [
      { role: 'explorer', model: 'sonnet' },
    ]);
    applyClaudeCodeManagedModelOverrides(config(), [
      { role: 'explorer', model: 'opus' },
    ]);

    const state = JSON.parse(
      readFileSync(
        join(pluginRoot(), '.thoth-agents-managed-models.json'),
        'utf8',
      ),
    ) as {
      models?: Record<string, string>;
      configuredModels?: Record<string, string>;
    };

    // models[role] must remain the rendered default, not the last override.
    expect(state.models?.explorer).toBe('haiku');
    expect(state.configuredModels?.explorer).toBe('opus');

    // A reset plan restores the true rendered default.
    const resetItem = buildClaudeCodeSetupPlan(
      config({ reset: true }),
    ).items.find((item) => item.role === 'explorer');
    expect(parseSubagentModel(String(resetItem?.content))).toBe('haiku');
  });
});
