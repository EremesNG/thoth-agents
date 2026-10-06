import { sep } from 'node:path';
import { visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import {
  formatCwd,
  formatTokens,
  renderStatusLine,
  type StatusData,
} from './layout.ts';

const mockTheme = {
  fg: (token: string, text: string) => `[${token}]${text}[/${token}]`,
};

describe('formatCwd', () => {
  it.each([
    { cwd: '/home/test', expected: '~' },
    {
      cwd: '/home/test/project/src',
      expected: `~${sep}project${sep}src`,
    },
    {
      cwd: '/home/test/project/../other',
      expected: `~${sep}other`,
    },
  ])('shortens $cwd inside home like the native footer', ({
    cwd,
    expected,
  }) => {
    expect(formatCwd(cwd, '/home/test')).toBe(expected);
  });

  it.each([
    '/home/test-other/project',
    '/home',
    '/home/test/../other',
    '/workspace/project/../src',
  ])('preserves %s outside home without normalization', (cwd) => {
    expect(formatCwd(cwd, '/home/test')).toBe(cwd);
  });

  it('preserves cwd when home is missing or empty', () => {
    expect(formatCwd('/workspace/project/../src')).toBe(
      '/workspace/project/../src',
    );
    expect(formatCwd('/workspace/project/../src', '')).toBe(
      '/workspace/project/../src',
    );
  });

  it('handles trailing separators and dot-prefixed child directories', () => {
    expect(formatCwd('/home/test/', '/home/test/')).toBe('~');
    expect(formatCwd('/home/test/..cache', '/home/test/')).toBe(
      `~${sep}..cache`,
    );
  });

  it.runIf(process.platform === 'win32')(
    'shortens native Windows paths and preserves paths on another drive',
    () => {
      expect(
        formatCwd(
          'C:\\Users\\EremesNG\\orca\\workspaces\\thoth-agents\\thoth-theme',
          'C:\\Users\\EremesNG',
        ),
      ).toBe('~\\orca\\workspaces\\thoth-agents\\thoth-theme');
      expect(
        formatCwd('c:/users/eremesng/project', 'C:\\Users\\EremesNG\\'),
      ).toBe('~\\project');
      expect(formatCwd('D:\\project', 'C:\\Users\\EremesNG')).toBe(
        'D:\\project',
      );
    },
  );
});

describe('formatTokens', () => {
  it('formats counts under 1K as plain numbers', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(500)).toBe('500');
    expect(formatTokens(999)).toBe('999');
  });

  it('formats counts in thousands with uppercase K and single decimal or integer', () => {
    expect(formatTokens(1000)).toBe('1K');
    expect(formatTokens(30000)).toBe('30K');
    expect(formatTokens(200000)).toBe('200K');
    expect(formatTokens(425900)).toBe('425.9K');
  });

  it('formats counts in millions with uppercase M and single decimal or integer', () => {
    expect(formatTokens(1000000)).toBe('1M');
    expect(formatTokens(1500000)).toBe('1.5M');
    expect(formatTokens(2000000)).toBe('2M');
  });
});

describe('renderStatusLine - target format and glyphs', () => {
  const sampleData: StatusData = {
    modelName: 'Claude 3.5 Sonnet',
    modelId: 'claude-3-5-sonnet',
    thinkingLevel: 'medium',
    gitBranch: 'feature/ac-2',
    contextPercent: 43,
    contextTokens: 425900,
    contextWindow: 1000000,
    cost: 1.234,
  };

  it('renders Unicode format with ● model, · ◐ effort, ◆ separator, ⑂ branch, [bar] % used, tokens, $<cost>', () => {
    const rendered = renderStatusLine(sampleData, {
      width: 200,
      mode: 'nerd',
    });

    expect(rendered).toContain('● Claude 3.5 Sonnet');
    expect(rendered).toContain('· ◐ med');
    expect(rendered).toContain('⑂ feature/ac-2');
    expect(rendered).toContain('43% used');
    expect(rendered).toContain('425.9K/1M');
    expect(rendered).toContain('$1.234');
    expect(rendered).toContain(' ◆ ');
    expect(rendered).not.toContain('\uf4b8'); // no Nerd Font model
    expect(rendered).not.toContain('\ue702'); // no Nerd Font git
    expect(rendered).not.toContain('\uf49d'); // no Nerd Font context
    expect(rendered).not.toContain('\uf155'); // no Nerd Font dollar
  });

  it('renders segments in exact order: model+effort, branch, bar, tokens, cost', () => {
    const rendered = renderStatusLine(sampleData, {
      width: 200,
      mode: 'nerd',
    });

    const modelIdx = rendered.indexOf('Claude 3.5 Sonnet');
    const effortIdx = rendered.indexOf('med');
    const branchIdx = rendered.indexOf('feature/ac-2');
    const barIdx = rendered.indexOf('43% used');
    const tokensIdx = rendered.indexOf('425.9K/1M');
    const costIdx = rendered.indexOf('$1.234');

    expect(modelIdx).toBeGreaterThanOrEqual(0);
    expect(effortIdx).toBeGreaterThan(modelIdx);
    expect(branchIdx).toBeGreaterThan(effortIdx);
    expect(barIdx).toBeGreaterThan(branchIdx);
    expect(tokensIdx).toBeGreaterThan(barIdx);
    expect(costIdx).toBeGreaterThan(tokensIdx);
  });

  it('renders ASCII format with * model, . o effort, | separator, git branch, [#/-] bar, $<cost>', () => {
    const rendered = renderStatusLine(sampleData, {
      width: 200,
      mode: 'ascii',
    });

    expect(rendered).toContain('* Claude 3.5 Sonnet');
    expect(rendered).toContain('. o med');
    expect(rendered).toContain('git feature/ac-2');
    expect(rendered).toContain('43% used');
    expect(rendered).toContain('425.9K/1M');
    expect(rendered).toContain('$1.234');
    expect(rendered).toContain(' | ');
    expect(rendered).not.toContain('◆');
    expect(rendered).not.toContain('●');
    expect(rendered).not.toContain('◐');
    expect(rendered).not.toContain('⑂');
  });

  it('uses model display name from modelName with fallback to modelId', () => {
    const withName = renderStatusLine(
      {
        ...sampleData,
        modelName: 'Claude 3.5 Sonnet',
        modelId: 'claude-sonnet',
      },
      { width: 200, mode: 'nerd' },
    );
    expect(withName).toContain('Claude 3.5 Sonnet');
    expect(withName).not.toContain('claude-sonnet');

    const withIdOnly = renderStatusLine(
      { ...sampleData, modelName: undefined, modelId: 'claude-sonnet' },
      { width: 200, mode: 'nerd' },
    );
    expect(withIdOnly).toContain('claude-sonnet');
  });

  it('omits effort when thinkingLevel is off or not specified', () => {
    const off = renderStatusLine(
      { ...sampleData, thinkingLevel: 'off' },
      { width: 200, mode: 'nerd' },
    );
    expect(off).not.toContain('◐');
    expect(off).not.toContain('off');
    expect(off).toContain('● Claude 3.5 Sonnet');

    const none = renderStatusLine(
      { ...sampleData, thinkingLevel: undefined },
      { width: 200, mode: 'nerd' },
    );
    expect(none).not.toContain('◐');
    expect(none).toContain('● Claude 3.5 Sonnet');
  });

  it.each([
    { mode: 'nerd', prefix: '⑂' },
    { mode: 'ascii', prefix: 'git' },
  ] as const)('renders cwd with branch in $mode mode, excluding unrelated path and extension statuses', ({
    mode,
    prefix,
  }) => {
    const dataWithExtras: StatusData & {
      path?: string;
      extensionStatuses?: unknown;
    } = {
      ...sampleData,
      cwd: '/workspace/project/src',
      path: '/ignored/path',
      extensionStatuses: new Map([['ext1', 'active']]),
    };

    const rendered = renderStatusLine(dataWithExtras, { width: 200, mode });

    expect(rendered).toContain(
      `${prefix} /workspace/project/src (feature/ac-2)`,
    );
    expect(rendered).not.toContain('/ignored/path');
    expect(rendered).not.toContain('active');
    expect(rendered).not.toContain('ext1');
  });

  it.each([
    'nerd',
    'ascii',
  ] as const)('renders just cwd without a branch or git prefix in %s mode', (mode) => {
    for (const gitBranch of [null, undefined, '']) {
      expect(
        renderStatusLine(
          { cwd: '/workspace/project/src', gitBranch },
          { width: 200, mode },
        ),
      ).toBe('/workspace/project/src');
    }
  });
});

describe('renderStatusLine - subscription cost', () => {
  it.each([
    'nerd',
    'ascii',
  ] as const)('appends (sub) only for subscription cost in %s mode', (mode) => {
    const marked = renderStatusLine(
      { cost: 1.234, isSubscription: true },
      { width: 100, mode, theme: mockTheme },
    );
    expect(marked).toBe('[accent]$1.234 (sub)[/accent]');

    const unmarked = renderStatusLine(
      { cost: 1.234, isSubscription: false },
      { width: 100, mode },
    );
    expect(unmarked).toBe('$1.234');
    expect(renderStatusLine({ cost: 1.234 }, { width: 100, mode })).toBe(
      '$1.234',
    );
  });

  it.each([
    'nerd',
    'ascii',
  ] as const)('prioritizes summed subscription cost within narrow widths in %s mode', (mode) => {
    const data: StatusData = {
      modelName: 'A very long model display name',
      cost: 0.3,
      subagentCost: 0.7,
      isSubscription: true,
    };
    for (let width = 1; width <= 60; width++) {
      const rendered = renderStatusLine(data, { width, mode });
      expect(visibleWidth(rendered)).toBeLessThanOrEqual(width);
      if (width >= 12) expect(rendered).toContain('$1.000 (sub)');
    }
  });
});

describe('renderStatusLine - unreported / null context usage', () => {
  it('shows — when contextPercent and contextTokens are null (no fake 0% or ?)', () => {
    const data: StatusData = {
      modelName: 'Claude Opus',
      contextPercent: null,
      contextTokens: null,
      contextWindow: 1000000,
      cost: 0,
    };

    const rendered = renderStatusLine(data, {
      width: 200,
      mode: 'nerd',
    });

    expect(rendered).toContain('—');
    expect(rendered).not.toContain('0%');
    expect(rendered).not.toContain('?');
  });

  it('shows 0% used when contextPercent is actually 0', () => {
    const data: StatusData = {
      modelName: 'Claude Opus',
      contextPercent: 0,
      contextTokens: 0,
      contextWindow: 1000000,
      cost: 0,
    };

    const rendered = renderStatusLine(data, {
      width: 200,
      mode: 'nerd',
    });

    expect(rendered).toContain('0% used');
  });
});

describe('renderStatusLine - thoth theme color mapping', () => {
  const data: StatusData = {
    modelName: 'Claude',
    thinkingLevel: 'medium',
    gitBranch: 'main',
    cwd: '~/project',
    contextPercent: 50,
    contextTokens: 100000,
    contextWindow: 200000,
    cost: 0.5,
  };

  it('maps segments to expected thoth palette tokens', () => {
    const rendered = renderStatusLine(data, {
      width: 500,
      mode: 'nerd',
      theme: mockTheme,
    });

    // Model lapis -> mdLink
    expect(rendered).toContain('[mdLink]');
    // Effort thinkingMedium
    expect(rendered).toContain('[thinkingMedium]');
    // Branch turquoise -> success
    expect(rendered).toContain('[success]⑂ ~/project (main)[/success]');
    // Bar fill under 70% -> success
    expect(rendered).toContain('[success]');
    // Bar empty -> dim
    expect(rendered).toContain('[dim]');
    // Percent same as fill -> success
    expect(rendered).toContain('[success]50% used[/success]');
    // Tokens -> muted
    expect(rendered).toContain('[muted]100K/200K[/muted]');
    // Cost gold -> accent
    expect(rendered).toContain('[accent]$0.500[/accent]');
    // Separators bronze -> border
    expect(rendered).toContain('[border]◆[/border]');
  });

  it('applies warning (ochre) when percent is between 70 and 89', () => {
    const rendered = renderStatusLine(
      { ...data, contextPercent: 75 },
      { width: 500, mode: 'nerd', theme: mockTheme },
    );
    expect(rendered).toContain('[warning]');
    expect(rendered).toContain('[warning]75% used[/warning]');
  });

  it('applies error (carnelian) when percent is 90 or above', () => {
    const rendered = renderStatusLine(
      { ...data, contextPercent: 95 },
      { width: 500, mode: 'nerd', theme: mockTheme },
    );
    expect(rendered).toContain('[error]');
    expect(rendered).toContain('[error]95% used[/error]');
  });
});

describe('renderStatusLine - responsive width degradation', () => {
  const fullData: StatusData = {
    modelName: 'Claude 3.5 Sonnet',
    thinkingLevel: 'medium',
    gitBranch: 'feature/ac-2',
    contextPercent: 43,
    contextTokens: 425900,
    contextWindow: 1000000,
    cost: 1.234,
  };

  it.each([
    'nerd',
    'ascii',
  ] as const)('falls back to branch-only before dropping other segments in %s mode', (mode) => {
    const data = {
      ...fullData,
      cwd: '~/orca/workspaces/thoth-agents/thoth-theme',
    };
    const full = renderStatusLine(data, { width: 200, mode });
    expect(full).toContain(`${data.cwd} (feature/ac-2)`);

    const reduced = renderStatusLine(data, {
      width: visibleWidth(full) - 1,
      mode,
    });
    expect(reduced).not.toContain(data.cwd);
    expect(reduced).toContain(
      mode === 'ascii' ? 'git feature/ac-2' : '⑂ feature/ac-2',
    );
    expect(reduced).toContain('43% used');
    expect(reduced).toContain('425.9K/1M');
    expect(reduced).toContain('med');
    expect(reduced).toContain('$1.234');
  });

  it.each([
    'nerd',
    'ascii',
  ] as const)('retains the original segment-drop priorities after path fallback in %s mode', (mode) => {
    const data = { ...fullData, cwd: '/workspace/project' };
    const withoutBar = renderStatusLine(data, { width: 70, mode });
    expect(withoutBar).not.toContain('43% used');
    expect(withoutBar).toContain('425.9K/1M');
    expect(withoutBar).toContain('feature/ac-2');
    expect(withoutBar).not.toContain(data.cwd);

    const withoutTokens = renderStatusLine(data, { width: 55, mode });
    expect(withoutTokens).not.toContain('425.9K/1M');
    expect(withoutTokens).toContain('feature/ac-2');

    const withoutBranch = renderStatusLine(data, { width: 40, mode });
    expect(withoutBranch).not.toContain('feature/ac-2');
    expect(withoutBranch).toContain('med');

    const withoutEffort = renderStatusLine(data, { width: 30, mode });
    expect(withoutEffort).not.toContain('med');
    expect(withoutEffort).toContain('Claude 3.5 Sonnet');
    expect(withoutEffort).toContain('$1.234');
  });

  it.each([
    'nerd',
    'ascii',
  ] as const)('keeps a branchless path until its original segment-drop priority in %s mode', (mode) => {
    const data: StatusData = {
      modelName: 'Model',
      thinkingLevel: 'low',
      cwd: '/workspace/project',
      contextPercent: 25,
      contextTokens: 50000,
      contextWindow: 200000,
      cost: 0.3,
    };
    const withoutBar = renderStatusLine(data, { width: 60, mode });
    expect(withoutBar).not.toContain('25% used');
    expect(withoutBar).toContain(data.cwd);
    expect(withoutBar).toContain('50K/200K');

    const withoutTokens = renderStatusLine(data, { width: 47, mode });
    expect(withoutTokens).toContain(data.cwd);
    expect(withoutTokens).not.toContain('50K/200K');

    const withoutPath = renderStatusLine(data, { width: 40, mode });
    expect(withoutPath).not.toContain(data.cwd);
    expect(withoutPath).toContain('low');
    expect(withoutPath).toContain('$0.300');
  });

  it('drops bar first when width shrinks', () => {
    const full = renderStatusLine(fullData, { width: 200, mode: 'nerd' });
    const fullWidth = visibleWidth(full);

    const reduced = renderStatusLine(fullData, {
      width: fullWidth - 5,
      mode: 'nerd',
    });

    expect(reduced).not.toContain('43% used');
    expect(reduced).toContain('425.9K/1M');
    expect(reduced).toContain('feature/ac-2');
    expect(reduced).toContain('Claude 3.5 Sonnet');
    expect(reduced).toContain('$1.234');
  });

  it('drops tokens second when width shrinks further', () => {
    // Drop bar: Model, Branch, Tokens, Cost
    const withoutBar = renderStatusLine(fullData, { width: 70, mode: 'nerd' });
    expect(withoutBar).not.toContain('43% used');

    // Make width tight enough to drop tokens as well
    const reduced = renderStatusLine(fullData, {
      width: visibleWidth(withoutBar) - 5,
      mode: 'nerd',
    });

    expect(reduced).not.toContain('43% used');
    expect(reduced).not.toContain('425.9K/1M');
    expect(reduced).toContain('feature/ac-2');
    expect(reduced).toContain('Claude 3.5 Sonnet');
    expect(reduced).toContain('$1.234');
  });

  it('drops branch third when width shrinks further', () => {
    const withoutTokens = renderStatusLine(fullData, {
      width: 55,
      mode: 'nerd',
    });
    expect(withoutTokens).not.toContain('425.9K/1M');

    const reduced = renderStatusLine(fullData, {
      width: visibleWidth(withoutTokens) - 5,
      mode: 'nerd',
    });

    expect(reduced).not.toContain('feature/ac-2');
    expect(reduced).toContain('Claude 3.5 Sonnet');
    expect(reduced).toContain('med');
    expect(reduced).toContain('$1.234');
  });

  it('drops effort fourth when width shrinks further', () => {
    const withoutBranch = renderStatusLine(fullData, {
      width: 40,
      mode: 'nerd',
    });
    expect(withoutBranch).not.toContain('feature/ac-2');

    const reduced = renderStatusLine(fullData, {
      width: visibleWidth(withoutBranch) - 5,
      mode: 'nerd',
    });

    expect(reduced).not.toContain('med');
    expect(reduced).toContain('Claude 3.5 Sonnet');
    expect(reduced).toContain('$1.234');
  });

  it('truncates model last while keeping cost high priority', () => {
    // Model + cost: Claude 3.5 Sonnet ◆ $1.234
    const tight = renderStatusLine(fullData, { width: 22, mode: 'nerd' });
    expect(tight).toContain('$1.234');
    expect(visibleWidth(tight)).toBeLessThanOrEqual(22);
  });

  it.each([
    'nerd',
    'ascii',
  ] as const)('never exceeds width with or without cwd and branch in %s mode', (mode) => {
    for (const data of [
      fullData,
      { ...fullData, cwd: '~/orca/workspaces/thoth-agents/thoth-theme' },
      { ...fullData, cwd: '/workspace/界/project', gitBranch: null },
    ]) {
      for (let width = 1; width <= 150; width++) {
        const rendered = renderStatusLine(data, { width, mode });
        expect(visibleWidth(rendered)).toBeLessThanOrEqual(width);
      }
    }
  });

  it('returns empty string when width <= 0', () => {
    expect(renderStatusLine(fullData, { width: 0, mode: 'nerd' })).toBe('');
    expect(renderStatusLine(fullData, { width: -5, mode: 'nerd' })).toBe('');
  });
});
