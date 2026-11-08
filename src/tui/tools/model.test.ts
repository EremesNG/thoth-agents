import { describe, expect, it } from 'vitest';
import { makeToolState } from './fixtures';
import {
  applyOverrides,
  countMatches,
  defaultScope,
  isDirty,
  manualEntries,
  maskGlobal,
  matchAction,
  openDraft,
  overviewTitle,
  previewRows,
  removeOverride,
  roleOf,
  roleSummary,
  rowDescription,
  rowTitle,
  scopeStatus,
  setOverride,
  validatePattern,
} from './model';

describe('tool permission model', () => {
  const state = makeToolState();

  it('summarises overrides and scope markers', () => {
    const explorer = roleOf(state, 'explorer');
    expect(roleSummary(explorer)).toBe('2 denied, 1 ask');
    expect(overviewTitle(explorer)).toContain('G explorer');
    expect(overviewTitle(roleOf(state, 'designer'))).toContain('P designer');
    expect(roleSummary(roleOf(state, 'worker'))).toBe('defaults');
    expect(defaultScope(roleOf(state, 'designer'))).toBe('project');
    expect(defaultScope(roleOf(state, 'worker'))).toBe('global');
  });

  it('matches wildcards like OpenCode', () => {
    expect(matchAction('github_search', 'github*', 'linux')).toBe(true);
    expect(matchAction('Bash', 'bash', 'linux')).toBe(false);
    expect(matchAction('Bash', 'bash', 'win32')).toBe(true);
    expect(matchAction('a/b', 'a?b', 'linux')).toBe(true);
    expect(countMatches(state, '*')).toBe(4);
  });

  it('mirrors inherit and explicit-choice semantics', () => {
    const start = [
      { action: 'a', effect: 'deny' as const },
      { action: '*', effect: 'ask' as const },
      { action: 'a', effect: 'allow' as const },
    ];
    expect(removeOverride(start, 'a')).toEqual([
      { action: '*', effect: 'ask' },
    ]);
    expect(setOverride(start, { action: 'a', effect: 'ask' })).toEqual([
      { action: '*', effect: 'ask' },
      { action: 'a', effect: 'ask' },
    ]);
  });

  it('previews draft effects with origin markers', () => {
    const draft = openDraft(state, 'explorer', 'global');
    expect(isDirty(draft)).toBe(false);
    const rows = previewRows(state, draft);
    const by = (a: string) => rows.find((r) => r.action === a);
    expect(by('bash')).toMatchObject({ effect: 'allow', source: 'default' });
    expect(rowTitle(by('bash') as never)).toContain('· allow');
    expect(rowDescription(by('bash') as never)).toContain('inherited');
    expect(by('webfetch')).toMatchObject({ effect: 'deny', source: 'entry' });
    expect(by('github')).toMatchObject({
      effect: 'ask',
      source: 'pattern',
      via: 'github*',
    });
    expect(rowDescription(by('github') as never)).toContain(
      'github_search, github_issue',
    );
    expect(by('subagent')).toMatchObject({ locked: true, effect: 'deny' });

    draft.overrides = setOverride(draft.overrides, {
      action: 'bash',
      effect: 'deny',
    });
    draft.overrides = removeOverride(draft.overrides, 'webfetch');
    const next = previewRows(state, draft);
    expect(next.find((r) => r.action === 'bash')).toMatchObject({
      effect: 'deny',
      changed: true,
    });
    expect(next.find((r) => r.action === 'webfetch')).toMatchObject({
      effect: 'allow',
      source: 'default',
      changed: true,
    });
  });

  it('restores the shipped edit deny immediately when its draft override is removed', () => {
    const state = makeToolState();
    state.inventory.push({
      action: 'edit',
      tools: ['write', 'patch'],
      locked: false,
    });
    const explorer = roleOf(state, 'explorer');
    explorer.global.overrides.push({
      action: 'edit',
      effect: 'allow',
      matchCount: 1,
    });
    explorer.actions.push({
      action: 'edit',
      baseEffect: 'deny',
      effect: 'allow',
      origin: 'global',
      locked: false,
    });
    const draft = openDraft(state, 'explorer', 'global');
    draft.overrides = removeOverride(draft.overrides, 'edit');
    const row = previewRows(state, draft).find((row) => row.action === 'edit');
    expect(row).toMatchObject({
      effect: 'deny',
      source: 'default',
      changed: true,
    });
    expect(rowDescription(row as never)).toContain('default (inherited)');
  });

  it('keeps broader draft patterns in force after removing an exact override', () => {
    const draft = openDraft(state, 'explorer', 'global');
    draft.overrides = [
      { action: '*', effect: 'ask' },
      { action: 'webfetch', effect: 'deny' },
    ];
    expect(
      previewRows(state, draft).find((row) => row.action === 'webfetch'),
    ).toMatchObject({
      effect: 'deny',
      source: 'entry',
    });
    draft.overrides = removeOverride(draft.overrides, 'webfetch');
    expect(
      previewRows(state, draft).find((row) => row.action === 'webfetch'),
    ).toMatchObject({
      effect: 'ask',
      source: 'pattern',
      via: '*',
    });
    expect(
      previewRows(state, draft).find((row) => row.action === 'subagent'),
    ).toMatchObject({
      effect: 'deny',
      locked: true,
    });
  });

  it('lists wildcard and unmatched entries with match counts', () => {
    const draft = openDraft(state, 'explorer', 'global');
    expect(manualEntries(state, draft)).toEqual([
      { action: 'github*', effect: 'ask', matchCount: 1 },
      { action: 'mcp_gone_*', effect: 'deny', matchCount: 0 },
    ]);
  });

  it('uses server match counts for saved patterns and local counts only for new draft patterns', () => {
    const state = makeToolState();
    const saved = roleOf(state, 'explorer').global.overrides;
    const pattern = saved.find((entry) => entry.action === 'github*');
    if (!pattern) throw new Error('Missing saved pattern');
    // Server and TUI may use different platform matching rules.
    pattern.matchCount = 2;
    const draft = openDraft(state, 'explorer', 'global');
    draft.overrides = setOverride(draft.overrides, {
      action: 'github*',
      effect: 'deny',
    });
    draft.overrides.push({ action: 'web*', effect: 'ask' });
    expect(manualEntries(state, draft)).toEqual([
      { action: 'mcp_gone_*', effect: 'deny', matchCount: 0 },
      { action: 'github*', effect: 'deny', matchCount: 2 },
      { action: 'web*', effect: 'ask', matchCount: 1 },
    ]);
  });

  it('validates patterns', () => {
    expect(validatePattern('  ')).toMatch(/Enter/);
    expect(validatePattern('subagent')).toMatch(/locked/);
    expect(validatePattern('github_*')).toBeUndefined();
  });

  describe('cross-scope effective layering', () => {
    const rowOf = (rows: ReturnType<typeof previewRows>, a: string) =>
      rows.find((r) => r.action === a);

    it('shows global effects when opening an absent project scope', () => {
      const draft = openDraft(state, 'explorer', 'project');
      const row = rowOf(previewRows(state, draft), 'webfetch');
      expect(row).toMatchObject({ effect: 'deny', origin: 'global' });
      expect(rowDescription(row as never)).toContain('global override');
      expect(isDirty(draft)).toBe(false);
    });

    it('labels global as inactive when a project entry controls the role', () => {
      const draft = openDraft(state, 'designer', 'global');
      const row = rowOf(previewRows(state, draft), 'bash');
      expect(row).toMatchObject({
        effect: 'allow',
        origin: 'project',
        inactive: true,
        scopeEffect: 'deny',
      });
      expect(rowDescription(row as never)).toContain('global alone would deny');
      expect(scopeStatus(state, draft)).toContain('INACTIVE');
    });

    it('keeps absent and explicit-empty project distinct and maskable', () => {
      const draft = openDraft(state, 'explorer', 'project');
      applyOverrides(draft, removeOverride(draft.overrides, 'webfetch'));
      expect(draft.present).toBe(false);
      maskGlobal(draft);
      expect(isDirty(draft)).toBe(true);
      const row = rowOf(previewRows(state, draft), 'webfetch');
      expect(row).toMatchObject({
        effect: 'allow',
        origin: 'default',
        changed: true,
      });
      expect(scopeStatus(state, draft)).toContain('masks global');
    });

    it('makes the project entry present when its list changes', () => {
      const draft = openDraft(state, 'explorer', 'project');
      applyOverrides(
        draft,
        setOverride(draft.overrides, { action: 'bash', effect: 'ask' }),
      );
      expect(draft.present).toBe(true);
      expect(rowOf(previewRows(state, draft), 'webfetch')).toMatchObject({
        effect: 'allow',
      });
    });

    it('displays a present empty project entry as masking global', () => {
      const s = makeToolState();
      const explorer = roleOf(s, 'explorer');
      explorer.project = { present: true, revision: 'p9', overrides: [] };
      explorer.effectiveScope = 'project';
      const draft = openDraft(s, 'explorer', 'project');
      expect(draft.present).toBe(true);
      expect(scopeStatus(s, draft)).toContain('masks global');
      const global = openDraft(s, 'explorer', 'global');
      expect(rowOf(previewRows(s, global), 'webfetch')).toMatchObject({
        effect: 'allow',
        inactive: true,
        scopeEffect: 'deny',
      });
    });
  });
});
