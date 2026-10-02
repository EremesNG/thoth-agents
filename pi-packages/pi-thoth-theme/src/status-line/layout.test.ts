import { visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';
import { renderStatusLine, type StatusData } from './layout.ts';

const mockTheme = {
  fg: (token: string, text: string) => `[${token}]${text}[/${token}]`,
};

describe('renderStatusLine - segment ordering and formatting', () => {
  const sampleData: StatusData = {
    model: 'claude-3-5-sonnet',
    thinkingLevel: 'medium',
    gitBranch: 'feature/ac-2',
    contextUsage: {
      percent: 15,
      tokens: 30000,
      contextWindow: 200000,
    },
    cost: 1.234,
    extensionStatuses: new Map([['ext1', 'ready']]),
  };

  it('renders segments in order: model+effort, git branch, context usage, cost, extension statuses', () => {
    const rendered = renderStatusLine(sampleData, {
      width: 200,
      mode: 'ascii',
    });

    const modelIdx = rendered.indexOf('claude-3-5-sonnet');
    const gitIdx = rendered.indexOf('feature/ac-2');
    const ctxIdx = rendered.indexOf('15%/200k');
    const costIdx = rendered.indexOf('$1.234');
    const extIdx = rendered.indexOf('ready');

    expect(modelIdx).toBeGreaterThanOrEqual(0);
    expect(gitIdx).toBeGreaterThan(modelIdx);
    expect(ctxIdx).toBeGreaterThan(gitIdx);
    expect(costIdx).toBeGreaterThan(ctxIdx);
    expect(extIdx).toBeGreaterThan(costIdx);
  });

  it('never renders a path or cwd segment', () => {
    const dataWithPath: StatusData & { cwd?: string; path?: string } = {
      ...sampleData,
      cwd: '/workspace/project/src',
      path: '/workspace/project/src',
    };

    const rendered = renderStatusLine(dataWithPath, {
      width: 200,
      mode: 'ascii',
    });

    expect(rendered).not.toContain('/workspace');
    expect(rendered).not.toContain('project');
  });

  it('renders ascii format with | separator and ascii icons', () => {
    const rendered = renderStatusLine(sampleData, {
      width: 200,
      mode: 'ascii',
    });

    expect(rendered).toContain(' | ');
    expect(rendered).not.toContain('│');
    expect(rendered).toContain('model claude-3-5-sonnet');
    expect(rendered).toContain('· med');
    expect(rendered).toContain('git feature/ac-2');
    expect(rendered).toContain('ctx 15%/200k');
    expect(rendered).toContain('$1.234');
  });

  it('renders nerd format with │ separator and nerd font icons', () => {
    const rendered = renderStatusLine(sampleData, {
      width: 200,
      mode: 'nerd',
    });

    expect(rendered).toContain(' │ ');
    expect(rendered).not.toContain(' | ');
    expect(rendered).toContain('\uf4b8 claude-3-5-sonnet');
    expect(rendered).toContain('\ue702 feature/ac-2');
    expect(rendered).toContain('\uf49d 15%/200k');
    expect(rendered).toContain('\uf1551.234');
  });

  it('applies theme colors for context warning and error thresholds', () => {
    const normal = renderStatusLine(
      { ...sampleData, contextUsage: { percent: 40, contextWindow: 100000 } },
      { width: 200, mode: 'ascii', theme: mockTheme },
    );
    expect(normal).not.toContain('[error]');
    expect(normal).not.toContain('[warning]');

    const warning = renderStatusLine(
      { ...sampleData, contextUsage: { percent: 75, contextWindow: 100000 } },
      { width: 200, mode: 'ascii', theme: mockTheme },
    );
    expect(warning).toContain('[warning]');

    const error = renderStatusLine(
      { ...sampleData, contextUsage: { percent: 92, contextWindow: 100000 } },
      { width: 200, mode: 'ascii', theme: mockTheme },
    );
    expect(error).toContain('[error]');
  });
});

describe('renderStatusLine - responsive narrow-width degradation', () => {
  const fullData: StatusData = {
    model: 'claude-3-5-sonnet',
    thinkingLevel: 'medium',
    gitBranch: 'feature/ac-2',
    contextUsage: {
      percent: 15,
      tokens: 30000,
      contextWindow: 200000,
    },
    cost: 1.234,
    extensionStatuses: new Map([['ext1', 'ready']]),
  };

  it('drops extension statuses first when width shrinks', () => {
    // Measure full width with all 5 segments
    const full = renderStatusLine(fullData, { width: 200, mode: 'ascii' });
    const fullWidth = full.length;

    // Give just enough width for model, git, context, cost without extension status
    const reduced = renderStatusLine(fullData, {
      width: fullWidth - 5,
      mode: 'ascii',
    });
    expect(reduced).not.toContain('ready');
    expect(reduced).toContain('claude-3-5-sonnet');
    expect(reduced).toContain('feature/ac-2');
    expect(reduced).toContain('15%/200k');
    expect(reduced).toContain('$1.234');
  });

  it('drops cost next when width shrinks further', () => {
    // 73 is full width without ext. Dropping cost gives 64.
    const rendered = renderStatusLine(fullData, { width: 68, mode: 'ascii' });
    expect(rendered).not.toContain('ready');
    expect(rendered).not.toContain('$1.234');
    expect(rendered).toContain('claude-3-5-sonnet');
    expect(rendered).toContain('feature/ac-2');
    expect(rendered).toContain('15%/200k');
  });

  it('drops git next when width shrinks further', () => {
    // 64 is model + git + ctx. Dropping git gives 45.
    const rendered = renderStatusLine(fullData, { width: 50, mode: 'ascii' });
    expect(rendered).not.toContain('feature/ac-2');
    expect(rendered).toContain('claude-3-5-sonnet');
    expect(rendered).toContain('15%/200k');
  });

  it('drops context next, leaving only model when width is tight', () => {
    // 45 is model + ctx. Dropping ctx gives 30.
    const rendered = renderStatusLine(fullData, { width: 35, mode: 'ascii' });
    expect(rendered).not.toContain('15%/200k');
    expect(rendered).toContain('claude-3-5-sonnet');
  });

  it('truncates model when width is narrower than model segment', () => {
    const rendered = renderStatusLine(fullData, { width: 10, mode: 'ascii' });
    expect(visibleWidth(rendered)).toBeLessThanOrEqual(10);
    expect(rendered).toContain('model');
  });

  it('never exceeds width across a range of narrow widths', () => {
    for (let w = 1; w <= 100; w++) {
      const rendered = renderStatusLine(fullData, { width: w, mode: 'ascii' });
      expect(visibleWidth(rendered)).toBeLessThanOrEqual(w);
    }
  });

  it('returns empty string when width <= 0', () => {
    expect(renderStatusLine(fullData, { width: 0, mode: 'ascii' })).toBe('');
    expect(renderStatusLine(fullData, { width: -5, mode: 'ascii' })).toBe('');
  });
});
