import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { describe, expect, it, onTestFinished } from 'vitest';
import { renderSubagentCompletionMessage } from '../../src/render/completion-message.js';
import { renderSubagentQuestionMessage } from '../../src/render/question-message.js';
import { renderSubagentResult } from '../../src/render/tools/subagent-result.js';

const result = {
  details: {
    task: { agent: 'worker', status: 'completed', result: 'answer' },
  },
};
const theme = { fg: (_role: string, text: string) => text };

const renderers = {
  result: (keyText: (action: string) => string) =>
    renderSubagentResult(result, { expanded: false }, theme, { keyText }),
  completion: (keyText: (action: string) => string) =>
    renderSubagentCompletionMessage(
      result,
      { expanded: false, keyText },
      theme,
    ),
  question: (keyText: (action: string) => string) =>
    renderSubagentQuestionMessage(result, { expanded: false, keyText }, theme),
};

describe.each([
  false,
  true,
])('injected expansion hints with KIT=%s', (withKit) => {
  it.each(
    Object.entries(renderers),
  )('%s reflects custom bindings and omits unbound instructions', (_name, render) => {
    if (withKit) {
      const token = registerRenderKit(createTestRenderKit(), {});
      onTestFinished(() => withdrawRenderKit(token));
    }
    const custom = render((action) =>
      action === 'app.tools.expand' ? 'ctrl+e/alt+e' : '',
    );
    expect(custom.render(120).join('\n')).toContain('ctrl+e/alt+e to expand');
    const unbound = render(() => '');
    expect(unbound.render(120).join('\n')).not.toContain('to expand');
    expect(unbound.render(120).join('\n')).not.toContain('ctrl+o');
  });

  it('keeps the component-owned label until the renderer is recreated', () => {
    if (withKit) {
      const token = registerRenderKit(createTestRenderKit(), {});
      onTestFinished(() => withdrawRenderKit(token));
    }
    let key = 'ctrl+e';
    const render = () => renderers.result(() => key);
    const component = render();
    key = 'ctrl+j';
    for (const width of [100, 80, 100]) {
      expect(component.render(width).join('\n')).toContain('ctrl+e to expand');
    }
    component.invalidate();
    expect(component.render(100).join('\n')).toContain('ctrl+e to expand');
    expect(render().render(100).join('\n')).toContain('ctrl+j to expand');
  });
});
