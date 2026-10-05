import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  resetExpandKeybindingProviderForTests,
  setExpandKeybindingProviderForTests,
} from '../../src/render/tools/expansion-hint.js';
import { renderSubagentResult } from '../../src/render/tools/subagent-result.js';

const result = {
  details: {
    task: { agent: 'worker', status: 'completed', result: 'answer' },
  },
};

// Exercise the renderer's native styling fallback, including its hint row.
const theme = { fg: () => undefined };

describe('component-owned expansion hints', () => {
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
