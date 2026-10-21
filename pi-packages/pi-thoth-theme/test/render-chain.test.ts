import type { Theme, ToolRenderers } from '@earendil-works/pi-coding-agent';
import type { Component } from '@earendil-works/pi-tui';
import { expect, it } from 'vitest';
import {
  assertCollected,
  renderChain,
} from '../../pi-core/test/helpers/render-chain.js';
import type { ThemeConfig } from '../src/shared/config.ts';
import {
  createCustomBashTool,
  createCustomPowerShellTool,
} from '../src/tools/bash.ts';
import { createCodemodeRenderer } from '../src/tools/codemode.ts';
import { createCustomEditTool } from '../src/tools/edit.ts';
import { createCustomFindTool } from '../src/tools/find.ts';
import { createGenericTool } from '../src/tools/generic.ts';
import { createCustomGrepTool } from '../src/tools/grep.ts';
import { createCustomLsTool } from '../src/tools/ls.ts';
import { createCustomReadTool } from '../src/tools/read.ts';
import { createCustomWriteTool } from '../src/tools/write.ts';

const config: ThemeConfig = {
  icons: 'ascii',
  statusLine: { enabled: true, subscriptionProviders: [] },
  tools: { enabled: true },
  welcome: { enabled: true },
};
const theme = {
  fg: (_role: string, text: string) => text,
  bg: (_role: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

const factories: [string, () => ToolRenderers][] = [
  ['bash', () => createCustomBashTool('.', config)],
  ['powershell', () => createCustomPowerShellTool('.', config)],
  ['read', () => createCustomReadTool('.', config)],
  ['write', () => createCustomWriteTool('.', config)],
  ['edit', () => createCustomEditTool('.', config)],
  ['find', () => createCustomFindTool('.', config)],
  ['grep', () => createCustomGrepTool('.', config)],
  ['ls', () => createCustomLsTool('.', config)],
  ['generic', () => createGenericTool('foreign', config)],
  ['codemode', () => createCodemodeRenderer(config)],
];
for (const [name, create] of factories) {
  it.each([
    'call',
    'result',
  ])(`${name} %s releases previous components while preserving shared state`, async (slot) => {
    const { renderCall, renderResult } = create();
    if (!renderCall || !renderResult) throw new Error('missing renderers');
    const state = {};
    const args = { path: 'file.ts', command: 'echo ok', code: 'return 1' };
    const { latest, previous } = renderChain<Component>((lastComponent) => {
      const context = {
        state,
        args,
        lastComponent,
        executionStarted: true,
        isPartial: false,
        isError: false,
      };
      const component =
        slot === 'call'
          ? renderCall(args, theme, context as never)
          : renderResult(
              { content: [{ type: 'text', text: 'ok' }], details: {} },
              { expanded: true, isPartial: false },
              theme,
              context as never,
            );
      component.render(80);
      return component;
    });
    await assertCollected(previous);
    latest.invalidate();
    expect(latest.render(80).length).toBeGreaterThan(0);
  });
}

it('still invalidates the previous result once without mutating the host context', () => {
  let invalidations = 0;
  const lastComponent = {
    invalidate() {
      invalidations++;
    },
  };
  const context = { state: {}, lastComponent };
  createCustomBashTool('.', config).renderResult(
    { content: [], details: {} },
    { expanded: false, isPartial: false },
    theme,
    context,
  );
  expect(invalidations).toBe(1);
  expect(context.lastComponent).toBe(lastComponent);
});
