import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { afterEach, describe, it, mock } from 'node:test';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { Box, Text } from '@earendil-works/pi-tui';
import { registerRenderKit, withdrawRenderKit } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { globalConfigPath } from '../src/config.js';
import activate from '../src/index.js';

initTheme('dark', false);
writeFileSync(
  globalConfigPath(),
  JSON.stringify({ askClaude: { enabled: true } }),
);
let tool;
activate({
  on() {},
  registerProvider() {},
  registerTool(definition) {
    tool = definition;
  },
});
assert.ok(tool, 'AskClaude is registered when enabled');

let token;
afterEach(() => {
  if (token) withdrawRenderKit(token);
  token = undefined;
  mock.restoreAll();
});
function withKit() {
  token = registerRenderKit(createTestRenderKit(), {});
}

const backgrounds = {
  toolPendingBg: '\x1b[48;5;238m',
  toolSuccessBg: '\x1b[48;5;22m',
  toolErrorBg: '\x1b[48;5;52m',
};
const theme = {
  fg: (_role, text) => text,
  bold: (text) => text,
  bg: (role, text) => `${backgrounds[role]}${text}\x1b[0m`,
};
const args = {
  prompt: 'Review the bridge',
  mode: 'full',
  model: 'sonnet',
  isolated: true,
};
const context = (overrides = {}) => ({
  args,
  toolCallId: 'ask-1',
  invalidate() {},
  lastComponent: undefined,
  state: {},
  cwd: process.cwd(),
  executionStarted: true,
  argsComplete: true,
  isPartial: true,
  expanded: false,
  showImages: false,
  isError: false,
  ...overrides,
});

function sdkBox(text, role, width) {
  const box = new Box(1, 1, (line) => theme.bg(role, line));
  box.addChild(new Text(text, 0, 0));
  return box.render(width);
}

describe('AskClaude rendering', () => {
  for (const scenario of [
    {
      name: 'success',
      isPartial: false,
      executionStarted: true,
      completed: true,
      status: 'completed',
      footer: '✓',
    },
    {
      name: 'running',
      isPartial: true,
      executionStarted: true,
      status: 'running',
      footer: 'running',
    },
    {
      name: 'not started',
      isPartial: true,
      executionStarted: false,
      status: 'running',
      footer: 'running',
    },
    {
      name: 'not started with a non-partial context',
      isPartial: false,
      executionStarted: false,
      status: 'completed',
      footer: '✓',
    },
    {
      name: 'SDK failure',
      isPartial: false,
      executionStarted: true,
      isError: true,
      status: 'failed',
      footer: '✗',
    },
    {
      name: 'bridge failure',
      isPartial: false,
      executionStarted: true,
      bridgeError: true,
      status: 'failed',
      footer: '✗',
    },
    {
      name: 'partial error',
      isPartial: true,
      executionStarted: true,
      isError: true,
      status: 'running',
      footer: 'running',
    },
  ]) {
    it(`signals ${scenario.name} consistently across AskClaude card parts`, () => {
      const kit = createTestRenderKit();
      const card = mock.method(kit, 'card');
      token = registerRenderKit(kit, {});
      const shared = context({
        isPartial: scenario.isPartial,
        executionStarted: scenario.executionStarted,
        isError: scenario.isError ?? false,
      });
      const call = tool.renderCall({ prompt: 'Review' }, theme, shared);
      const result = tool.renderResult(
        {
          content: [{ type: 'text', text: 'Output' }],
          details: { error: scenario.bridgeError ?? false },
        },
        { expanded: false, isPartial: scenario.isPartial },
        theme,
        shared,
      );
      call.render(100);
      assert.equal(result.render(100).at(-1), `╰─ ${scenario.footer}`);
      const options = card.mock.calls.map(
        ({ arguments: [, options] }) => options,
      );
      assert.deepEqual(
        options.map(({ part }) => part),
        ['start', 'end'],
      );
      assert.equal(options[0].status, undefined);
      assert.equal(options[0].footer, undefined);
      assert.equal(options[1].status, scenario.status);
      assert.equal(options[1].footer, scenario.footer);
      assert.equal(options[1].context, shared);
      for (const option of options) {
        assert.equal(option.isSuccess, scenario.completed ?? false);
        assert.equal(
          option.isError,
          Boolean(scenario.isError || scenario.bridgeError),
        );
      }
    });
  }

  it('retains bridge error borders and failure footer after call-slot reconstruction', () => {
    const kit = createTestRenderKit();
    const card = mock.method(kit, 'card');
    token = registerRenderKit(kit, {});
    const shared = context({ isPartial: false });
    tool.renderCall({ prompt: 'Review' }, theme, shared);
    const result = tool.renderResult(
      {
        content: [{ type: 'text', text: 'Error: unavailable' }],
        details: { error: true },
      },
      { expanded: false, isPartial: false },
      theme,
      shared,
    );
    const updatedCall = tool.renderCall({ prompt: 'Review' }, theme, shared);
    updatedCall.render(100);
    // A reconstructed call slot must not turn the bridge failure footer into success.
    assert.equal(result.render(100).at(-1), '╰─ ✗');
    assert.deepEqual(
      card.mock.calls.map(({ arguments: [, options] }) => options.status),
      [undefined, 'failed'],
    );
    for (const {
      arguments: [, options],
    } of card.mock.calls) {
      assert.equal(options.isError, true);
      assert.notEqual(options.isSuccess, true);
    }
    withdrawRenderKit(token);
    assert.deepEqual(
      [...updatedCall.render(100), ...result.render(100)],
      sdkBox(
        'AskClaude "Review"\n✗ Claude Code error\nError: unavailable',
        'toolSuccessBg',
        100,
      ),
    );
  });

  it('does not infer AskClaude success before a result exists', () => {
    const kit = createTestRenderKit();
    const card = mock.method(kit, 'card');
    token = registerRenderKit(kit, {});
    const call = tool.renderCall(
      { prompt: 'Review' },
      theme,
      context({ isPartial: false }),
    );
    assert.equal(call.render(100).at(-1), '╰─ ✓');
    assert.equal(card.mock.calls[0].arguments[1].status, 'completed');
    assert.equal(card.mock.calls[0].arguments[1].footer, '✓');
    assert.notEqual(card.mock.calls[0].arguments[1].isSuccess, true);
  });

  for (const slot of ['call', 'partial', 'collapsed', 'expanded']) {
    it(`reuses ${slot} KIT lines until width, invalidation or kit registration changes`, () => {
      const shared = context({ isPartial: slot === 'partial' });
      const create = () =>
        slot === 'call'
          ? tool.renderCall({ prompt: 'Review' }, theme, shared)
          : tool.renderResult(
              {
                content: [{ type: 'text', text: 'Done' }],
                details: { prompt: 'Review', executionTime: 1000 },
              },
              { expanded: slot === 'expanded', isPartial: slot === 'partial' },
              theme,
              shared,
            );
      const component = create();
      const native = component.render(100);
      const kit = createTestRenderKit();
      const card = mock.method(kit, 'card');
      token = registerRenderKit(kit, {});
      const lines = component.render(100);
      assert.deepEqual(
        lines,
        slot === 'call'
          ? ['╭─ AskClaude', '"Review"', '╰─ ✓']
          : [
              ...(slot === 'expanded'
                ? ['├─ Prompt', 'Review', '├─ Output']
                : []),
              'Done',
              `╰─ ${slot === 'partial' ? 'running' : '✓'} · 1s`,
            ],
      );
      assert.strictEqual(component.render(100), lines);
      assert.equal(card.mock.callCount(), 1);
      component.render(40);
      assert.equal(card.mock.callCount(), 2);
      component.invalidate();
      component.render(40);
      assert.equal(card.mock.callCount(), 3);
      assert.deepEqual(component.render(100), lines);
      assert.equal(card.mock.callCount(), 4);
      assert.deepEqual(create().render(100), lines);
      assert.equal(card.mock.callCount(), 5);

      const replacement = createTestRenderKit();
      const replacementCard = mock.method(replacement, 'card');
      token = registerRenderKit(replacement, {});
      assert.deepEqual(component.render(100), lines);
      assert.deepEqual(component.render(100), lines);
      assert.equal(replacementCard.mock.callCount(), 1);
      withdrawRenderKit(token);
      assert.deepEqual(component.render(100), native);
      component.invalidate();
      assert.deepEqual(component.render(100), native);
      token = registerRenderKit(kit, {});
      assert.deepEqual(component.render(100), lines);
      assert.equal(card.mock.callCount(), 6);
    });
  }

  it('uses a single KIT card for call tags, prompt, result and status/duration footer', () => {
    withKit();
    const shared = context();
    const call = tool.renderCall(args, theme, shared);
    assert.deepEqual(call.render(100), [
      '╭─ AskClaude',
      '[mode=full, model=sonnet, isolated]',
      '"Review the bridge"',
      '╰─ running',
    ]);
    shared.isPartial = false;
    const result = tool.renderResult(
      {
        content: [{ type: 'text', text: 'Looks good' }],
        details: {
          prompt: args.prompt,
          executionTime: 12345,
          actions: '2 reads',
        },
      },
      { expanded: false, isPartial: false },
      theme,
      shared,
    );
    // SDK updates recreate both renderer slots before drawing them.
    const updatedCall = tool.renderCall(args, theme, shared);
    call.invalidate();
    assert.deepEqual(call.render(100), updatedCall.render(100));
    assert.deepEqual(
      [...updatedCall.render(100), ...result.render(100)],
      [
        '╭─ AskClaude',
        '[mode=full, model=sonnet, isolated]',
        '"Review the bridge"',
        'Looks good',
        '╰─ ✓ · 12s · 2 reads',
      ],
    );
  });

  it('folds KIT output at eight rows and shows divider-separated prompt/output when expanded', () => {
    withKit();
    const result = {
      content: [
        {
          type: 'text',
          text: 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten',
        },
      ],
      details: { prompt: 'Review\nthe bridge', executionTime: 0 },
    };
    const shared = context({ isPartial: false });
    const call = tool.renderCall({ prompt: 'Review' }, theme, shared);
    const collapsed = tool.renderResult(
      result,
      { expanded: false, isPartial: false },
      theme,
      shared,
    );
    assert.deepEqual(
      [...call.render(100), ...collapsed.render(100)],
      [
        '╭─ AskClaude',
        '"Review"',
        'one',
        'two',
        'three',
        'four',
        'five',
        'six',
        'seven',
        'eight',
        '… 2 more lines · ctrl+o to expand',
        '╰─ ✓ · 0s',
      ],
    );
    const expanded = tool.renderResult(
      result,
      { expanded: true, isPartial: false },
      theme,
      shared,
    );
    assert.deepEqual(expanded.render(100), [
      '├─ Prompt',
      'Review',
      'the bridge',
      '├─ Output',
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
      'ten',
      '╰─ ✓ · 0s',
    ]);
  });

  it('applies the KIT collapse budget to wrapped rows at the available card width', () => {
    withKit();
    const result = tool.renderResult(
      { content: [{ type: 'text', text: 'x'.repeat(360) }] },
      { expanded: false, isPartial: false },
      theme,
      context({ isPartial: false }),
    );
    const lines = result.render(40);
    assert.equal(
      lines.length,
      10,
      'eight output rows, one hint and one footer',
    );
    assert.deepEqual(lines.slice(0, 8), Array(8).fill('x'.repeat(36)));
    assert.equal(lines[8], '… 2 more lines · ctrl+o to expand');
  });

  it('bounds a multiline KIT prompt preview to six physical rows', () => {
    withKit();
    const call = tool.renderCall(
      { prompt: 'one\ntwo\nthree\nfour\nfive\nsix\nseven' },
      theme,
      context({ executionStarted: false }),
    );
    assert.deepEqual(call.render(100), [
      '╭─ AskClaude',
      '"one',
      'two',
      'three',
      'four',
      'five',
      'six" …',
      '╰─ pending',
    ]);
  });

  it('switches existing call/result components between native and KIT at the same width', () => {
    const shared = context({ isPartial: false });
    const call = tool.renderCall({ prompt: 'Review' }, theme, shared);
    const result = tool.renderResult(
      { content: [{ type: 'text', text: 'Done' }] },
      { expanded: false, isPartial: false },
      theme,
      shared,
    );
    const native = sdkBox(
      'AskClaude "Review"\n✓ Claude Code\nDone',
      'toolSuccessBg',
      60,
    );
    const kit = ['╭─ AskClaude', '"Review"', 'Done', '╰─ ✓'];
    assert.deepEqual([...call.render(60), ...result.render(60)], native);
    withKit();
    assert.deepEqual([...call.render(60), ...result.render(60)], kit);
    withdrawRenderKit(token);
    assert.deepEqual([...call.render(60), ...result.render(60)], native);
    withKit();
    assert.deepEqual([...call.render(60), ...result.render(60)], kit);
    // SDK invokes the same renderer definition again on updates, too.
    assert.deepEqual(
      tool.renderCall({ prompt: 'Review' }, theme, shared).render(60),
      kit.slice(0, 2),
    );
  });

  it('shows running KIT progress with producer duration and no duplicate call footer', () => {
    withKit();
    const shared = context();
    const call = tool.renderCall({ prompt: 'Review' }, theme, shared);
    const result = tool.renderResult(
      {
        content: [{ type: 'text', text: '5s — reading files' }],
        details: { executionTime: 5000, prompt: 'Review' },
      },
      { expanded: true, isPartial: true },
      theme,
      shared,
    );
    assert.deepEqual(
      [...call.render(100), ...result.render(100)],
      ['╭─ AskClaude', '"Review"', '5s — reading files', '╰─ running · 5s'],
    );
  });

  it('keeps action details in the running body without extending the standard footer', () => {
    withKit();
    const component = tool.renderResult(
      {
        content: [{ type: 'text', text: 'Reading files' }],
        details: { executionTime: 5000, actions: '2 reads' },
      },
      { expanded: false, isPartial: true },
      theme,
      context(),
    );
    assert.deepEqual(component.render(100), [
      'Reading files',
      '2 reads',
      '╰─ running · 5s',
    ]);
  });

  for (const sdkError of [false, true]) {
    it(`shares a uniform native error shell and KIT error state for ${sdkError ? 'SDK' : 'bridge'} errors`, () => {
      const shared = context({ isPartial: false, isError: sdkError });
      const call = tool.renderCall({ prompt: 'Review' }, theme, shared);
      const result = tool.renderResult(
        {
          content: [{ type: 'text', text: 'Error: unavailable' }],
          details: sdkError ? undefined : { error: true },
        },
        { expanded: false, isPartial: false },
        theme,
        shared,
      );
      assert.deepEqual(
        [...call.render(80), ...result.render(80)],
        sdkBox(
          'AskClaude "Review"\n✗ Claude Code error\nError: unavailable',
          'toolErrorBg',
          80,
        ),
      );
      withKit();
      assert.deepEqual(
        [...call.render(80), ...result.render(80)],
        ['╭─ ! AskClaude', '"Review"', 'Error: unavailable', '╰─ ✗'],
      );
    });
  }

  it('preserves expanded native prompt, divider, output and success padding', () => {
    const shared = context({ isPartial: false });
    const call = tool.renderCall({ prompt: 'Review' }, theme, shared);
    const result = tool.renderResult(
      {
        content: [{ type: 'text', text: 'Looks good' }],
        details: { prompt: 'Review', executionTime: 12345, actions: '2 reads' },
      },
      { expanded: true, isPartial: false },
      theme,
      shared,
    );
    const expected = sdkBox(
      'AskClaude "Review"\n✓ Claude Code 12.3s 2 reads\nPrompt: Review\n────────────────────────────────────────\nLooks good',
      'toolSuccessBg',
      80,
    );
    assert.deepEqual([...call.render(80), ...result.render(80)], expected);
    assert.deepEqual(call.render(0), []);
    assert.deepEqual(result.render(0), []);
  });

  it('keeps a self shell and the SDK pending box when KIT is absent', () => {
    assert.equal(tool.renderShell, 'self');
    const component = tool.renderCall(args, theme, context());
    const callText =
      'AskClaude [mode=full, model=sonnet, isolated] "Review the bridge"';
    assert.deepEqual(
      component.render(100),
      sdkBox(callText, 'toolPendingBg', 100),
    );

    const shared = context();
    const call = tool.renderCall(args, theme, shared);
    const result = tool.renderResult(
      { content: [{ type: 'text', text: 'working...' }] },
      { expanded: false, isPartial: true },
      theme,
      shared,
    );
    assert.deepEqual(
      [...call.render(100), ...result.render(100)],
      sdkBox(`${callText}\n◉ Claude Code working...`, 'toolPendingBg', 100),
    );
  });
});
