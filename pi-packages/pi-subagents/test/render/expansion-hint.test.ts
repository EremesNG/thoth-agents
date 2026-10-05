import { readFileSync } from 'node:fs';
import { keyText } from '@earendil-works/pi-coding-agent';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  resetExpandKeybindingProviderForTests,
  resolveExpandKeyText,
  setExpandKeybindingProviderForTests,
} from '../../src/render/tools/expansion-hint.js';
import { renderSubagentResult } from '../../src/render/tools/subagent-result.js';

vi.mock('@earendil-works/pi-coding-agent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@earendil-works/pi-coding-agent')>()),
  keyText: vi.fn(),
}));

beforeEach(() => {
  resetExpandKeybindingProviderForTests();
  vi.mocked(keyText).mockReset().mockReturnValue('ctrl+o');
});

const result = {
  details: {
    task: { agent: 'worker', status: 'completed', result: 'answer' },
  },
};

// Exercise the renderer's native styling fallback, including its hint row.
const theme = { fg: () => undefined };

describe('expansion key resolution', () => {
  it('prefers a trimmed test provider key over context and native keys', () => {
    vi.mocked(keyText).mockReturnValue('ctrl+k');
    setExpandKeybindingProviderForTests(() => '  ctrl+e  ');
    onTestFinished(resetExpandKeybindingProviderForTests);
    const getKeys = vi.fn(() => 'ctrl+j');

    expect(resolveExpandKeyText({ keybindings: { getKeys } })).toBe('ctrl+e');
    expect(getKeys).not.toHaveBeenCalled();
    expect(keyText).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    '',
    '  ',
  ])('ignores an empty test provider key (%j)', (key) => {
    setExpandKeybindingProviderForTests(() => key);
    onTestFinished(resetExpandKeybindingProviderForTests);
    vi.mocked(keyText).mockReturnValue('ctrl+k');

    expect(
      resolveExpandKeyText({ keybindings: { getKeys: () => 'ctrl+j' } }),
    ).toBe('ctrl+j');
    expect(keyText).not.toHaveBeenCalled();
  });

  it.each([
    { keybindings: { getKeys: () => '  ctrl+j  ' } },
    { keybindings: { getKeys: () => ['  ctrl+j  ', 'ctrl+l'] } },
    { ui: { keybindings: { getKeys: () => '  ctrl+j  ' } } },
    { ui: { keybindings: { getKeys: () => ['  ctrl+j  '] } } },
  ])('prefers a trimmed context key over the native key (%j)', (context) => {
    vi.mocked(keyText).mockReturnValue('ctrl+k');

    expect(resolveExpandKeyText(context)).toBe('ctrl+j');
    expect(keyText).not.toHaveBeenCalled();
  });

  it.each([
    '',
    '  ',
    [],
    [''],
    ['  '],
    [undefined],
    42,
  ])('uses the native key when context keys are unusable (%j)', (keys) => {
    vi.mocked(keyText).mockReturnValue('ctrl+k');

    expect(resolveExpandKeyText({ keybindings: { getKeys: () => keys } })).toBe(
      'ctrl+k',
    );
  });

  it.each([
    ['  ctrl+k  ', 'ctrl+k'],
    ['', 'ctrl+o'],
    [' \t ', 'ctrl+o'],
  ])('resolves native key text %j to %s', (nativeText, expected) => {
    vi.mocked(keyText).mockReturnValue(nativeText);

    expect(resolveExpandKeyText()).toBe(expected);
  });

  it('does not load another Pi module graph with require', () => {
    const source = readFileSync(
      new URL('../../src/render/tools/expansion-hint.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('node:module');
    expect(source).not.toContain('createRequire');
    expect(source).not.toContain('require(');
    expect(source).not.toContain('dist/index.js');
  });
});

describe('component-owned expansion hints', () => {
  it('uses the host Pi expansion key in the collapsed hint', () => {
    vi.mocked(keyText).mockReturnValue('ctrl+k');

    const component = renderSubagentResult(result, { expanded: false }, theme);

    expect(component.render(100).join('\n')).toContain('ctrl+k to expand');
    expect(keyText).toHaveBeenCalledExactlyOnceWith('app.tools.expand');
  });

  it('uses the default hint when host keybindings are not initialized', () => {
    vi.mocked(keyText).mockImplementation(() => {
      throw new Error('Keybindings are not initialized');
    });

    const component = renderSubagentResult(result, { expanded: false }, theme);

    expect(component.render(100).join('\n')).toContain('ctrl+o to expand');
  });

  it.each([
    false,
    true,
  ])('resolves key text once at creation, not on frames, with KIT=%s', (withKit) => {
    if (withKit) {
      const token = registerRenderKit(createTestRenderKit(), {});
      onTestFinished(() => withdrawRenderKit(token));
    }
    let key = 'ctrl+e';
    const resolveKey = vi.fn(() => key);
    setExpandKeybindingProviderForTests(resolveKey);
    onTestFinished(resetExpandKeybindingProviderForTests);
    const component = renderSubagentResult(result, { expanded: false }, theme);
    expect(resolveKey).toHaveBeenCalledExactlyOnceWith('app.tools.expand');
    key = 'ctrl+j';

    for (const width of [100, 100, 80]) {
      expect(component.render(width).join('\n')).toContain('ctrl+e to expand');
    }
    component.invalidate();
    expect(component.render(100).join('\n')).toContain('ctrl+e to expand');
    expect(resolveKey).toHaveBeenCalledTimes(1);

    const recreated = renderSubagentResult(result, { expanded: false }, theme);
    expect(recreated.render(100).join('\n')).toContain('ctrl+j to expand');
    expect(resolveKey).toHaveBeenCalledTimes(2);
  });
});
