import type {
  Theme,
  ToolDefinition,
  ToolRendererResolver,
} from '@earendil-works/pi-coding-agent';
import { createKitRenderMemo } from '@thoth-agents/pi-core';
import { createTestRenderKit } from '@thoth-agents/pi-core/testing';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  getRenderKit,
  getToolElapsedMs,
  type RenderIndicatorContext,
  type RenderKitTheme,
  type RenderStatus,
  type RenderToolFooterOptions,
  registerRenderKit,
  renderToolFooter,
  resolveFrames,
  resolveIcon,
  resolveStatusGlyph,
  type SemanticFrameName,
  type SemanticGlyphName,
  type SemanticIconName,
  type ThothRenderKit,
  type ToolRenderersLike,
  withdrawRenderKit,
} from '../src/index.js';

const registryKey = Symbol.for('thoth-agents.pi-core.render-kit.v1');
const shared = globalThis as typeof globalThis & { [registryKey]?: unknown };
const kit = createTestRenderKit();
const theme = { fg: (_role: string, text: string) => text };

afterEach(() => {
  delete shared[registryKey];
  vi.useRealTimers();
});

describe('render kit registry', () => {
  it('accepts SDK 1.0.2 theme and tool render context structurally', () => {
    type Context = Parameters<NonNullable<ToolDefinition['renderCall']>>[2];
    expectTypeOf<Theme>().toExtend<RenderKitTheme>();
    expectTypeOf<Context>().toExtend<RenderIndicatorContext>();
    expectTypeOf<Context>().toExtend<
      NonNullable<RenderToolFooterOptions['context']>
    >();
  });

  it('accepts legacy v1 kits without a tool resolver', () => {
    expect('resolveToolRenderers' in kit).toBe(false);
    registerRenderKit(kit, {});
    expect(getRenderKit()).toBe(kit);
  });

  it('accepts legacy v1 kits without toolFooter and uses the plain fallback', () => {
    const { toolFooter: _toolFooter, ...legacy } = kit;
    registerRenderKit(legacy, {});
    expect(getRenderKit()).toBe(legacy);
    expect(
      renderToolFooter(getRenderKit(), theme, {
        status: 'completed',
        summary: 'Done',
      }),
    ).toBe('✓ · Done');
  });

  it.each([
    undefined,
    null,
    false,
    42,
    'footer',
    {},
  ])('rejects a present non-callable toolFooter: %s', (toolFooter) => {
    registerRenderKit({ ...kit, toolFooter } as ThothRenderKit, {});
    expect(getRenderKit()).toBeUndefined();
  });

  it('ignores toolFooter with a throwing accessor', () => {
    registerRenderKit(
      {
        ...kit,
        get toolFooter(): never {
          throw new Error('foreign accessor');
        },
      },
      {},
    );
    expect(getRenderKit()).toBeUndefined();
  });

  it('accepts a host-compatible tool resolver and preserves its downstream renderers', () => {
    const downstream: ToolRenderersLike = { renderShell: 'self' };
    const extended: ThothRenderKit = {
      ...kit,
      resolveToolRenderers: (_name, next) => next(),
    };
    expectTypeOf<
      NonNullable<ThothRenderKit['resolveToolRenderers']>
    >().toExtend<ToolRendererResolver>();
    expectTypeOf<ToolRendererResolver>().toExtend<
      NonNullable<ThothRenderKit['resolveToolRenderers']>
    >();
    registerRenderKit(extended, {});
    expect(getRenderKit()).toBe(extended);
    expect(
      getRenderKit()?.resolveToolRenderers?.('read', () => downstream),
    ).toBe(downstream);
  });

  it.each([
    undefined,
    null,
    false,
    42,
    'resolver',
    {},
  ])('rejects a present non-callable tool resolver: %s', (resolveToolRenderers) => {
    registerRenderKit({ ...kit, resolveToolRenderers } as ThothRenderKit, {});
    expect(getRenderKit()).toBeUndefined();
  });

  it('ignores tool resolvers with a throwing accessor', () => {
    registerRenderKit(
      {
        ...kit,
        get resolveToolRenderers(): never {
          throw new Error('foreign accessor');
        },
      },
      {},
    );
    expect(getRenderKit()).toBeUndefined();
  });

  it.each([
    undefined,
    null,
    false,
    42,
    'lookup',
    {},
  ])('rejects a present non-callable icon lookup: %s', (icon) => {
    registerRenderKit({ ...kit, icon } as ThothRenderKit, {});
    expect(getRenderKit()).toBeUndefined();
    expect(resolveIcon('selection', 'native')).toBe('native');
  });

  it('ignores icon lookups with a throwing accessor', () => {
    registerRenderKit(
      {
        ...kit,
        get icon(): never {
          throw new Error('foreign accessor');
        },
      },
      {},
    );
    expect(getRenderKit()).toBeUndefined();
    expect(resolveIcon('selection', 'native')).toBe('native');
  });

  it('shares registrations across independently loaded copies of pi-core', async () => {
    const copy = await import(
      `${new URL('../src/render-kit.ts', import.meta.url).href}?copy`
    );
    const token = copy.registerRenderKit(kit, {});
    expect(getRenderKit()).toBe(kit);
    withdrawRenderKit(token);
    expect(copy.getRenderKit()).toBeUndefined();
  });

  it.each([
    null,
    {},
    { kit: { ...kit, version: 2 } },
    { kit: { version: 1 } },
    { kit: { ...kit, card: null } },
    {
      get kit() {
        throw new Error('foreign accessor');
      },
    },
  ])('ignores missing, incompatible or malformed foreign registrations', (value) => {
    shared[registryKey] = value;
    expect(getRenderKit()).toBeUndefined();
  });

  it('discovers the current kit and withdraws only the owning registration', () => {
    expect(getRenderKit()).toBeUndefined();
    const owner = {};
    const old = registerRenderKit(kit, owner);
    expect(getRenderKit()).toBe(kit);
    const replacement = { ...kit };
    const current = registerRenderKit(replacement, owner);
    expect(current).not.toBe(old);
    withdrawRenderKit(old);
    expect(getRenderKit()).toBe(replacement);
    withdrawRenderKit(Symbol('foreign'));
    expect(getRenderKit()).toBe(replacement);
    withdrawRenderKit(current);
    expect(getRenderKit()).toBeUndefined();
    withdrawRenderKit(current);
    expect(getRenderKit()).toBeUndefined();
  });
});

describe('semantic icon resolvers', () => {
  it('keeps current native glyphs and literals without a registered kit', () => {
    const nativeIcons: Record<SemanticGlyphName, string> = {
      branch: '⑂',
      folder: 'dir',
      model: '●',
      effort: '◐',
      context: 'ctx',
      cost: '$',
      tokensIn: '↑',
      tokensOut: '↓',
      cache: 'cache',
      throughput: 'tok/s',
      agent: '\u{f08c7}',
      tool: '*',
      bash: '$',
      read: 'read',
      write: 'write',
      edit: 'edit',
      search: 'search',
      file: 'file',
      separator: '·',
      ellipsis: '…',
      arrowUp: '↑',
      arrowDown: '↓',
      arrowLeft: '←',
      arrowRight: '→',
      selection: '›',
      selectionSelected: '●',
      selectionUnselected: '○',
      taskInProgress: '◇',
      separatorHeavy: '┃',
      boxTopLeft: '╭',
      boxTopRight: '╮',
      boxVertical: '│',
      boxBottomLeft: '╰',
      boxBottomRight: '╯',
      boxHorizontal: '─',
      boxTDown: '┬',
      boxTUp: '┴',
      boxTRight: '├',
      boxTLeft: '┤',
      boxCross: '┼',
      close: '✕',
      scrollUp: '↑',
      scrollDown: '↓',
      ready: '▲',
      warning: '⚠',
    };
    const resolved = Object.fromEntries(
      (Object.keys(nativeIcons) as SemanticGlyphName[]).map((name) => [
        name,
        resolveIcon(name),
      ]),
    );
    expect(resolved).toEqual(nativeIcons);
    expect(resolveIcon('separator', '┃')).toBe('┃');
    expect(resolveIcon('folder', '')).toBe('');
  });

  it('preserves new panel glyphs with legacy v1 icon lookups', () => {
    const native = () => [
      resolveIcon('taskInProgress'),
      resolveIcon('selectionSelected'),
      resolveIcon('selectionUnselected'),
      resolveIcon('separatorHeavy'),
      resolveIcon('boxTopLeft'),
      resolveIcon('boxHorizontal'),
      resolveIcon('boxTDown'),
      resolveIcon('boxTUp'),
      resolveIcon('boxTRight'),
      resolveIcon('boxTLeft'),
      resolveIcon('boxCross'),
      resolveIcon('close'),
    ];
    registerRenderKit(kit, {});
    expect(native()).toEqual([
      '◇',
      '●',
      '○',
      '┃',
      '╭',
      '─',
      '┬',
      '┴',
      '├',
      '┤',
      '┼',
      '✕',
    ]);
    registerRenderKit(
      {
        ...kit,
        icon(name) {
          if (name === 'selection') return '>';
          throw new Error('unsupported icon');
        },
      },
      {},
    );
    expect(getRenderKit()?.version).toBe(1);
    expect(resolveIcon('selection')).toBe('>');
    expect(native()).toEqual([
      '◇',
      '●',
      '○',
      '┃',
      '╭',
      '─',
      '┬',
      '┴',
      '├',
      '┤',
      '┼',
      '✕',
    ]);
  });

  it('preserves native statuses and caller-specific status fallbacks without a kit', () => {
    const nativeStatuses: Record<RenderStatus, string> = {
      pending: '○',
      queued: '○',
      in_progress: '◐',
      running: '◐',
      completed: '✓',
      failed: '✗',
      cancelled: '■',
      interrupted: '■',
      stopping: '■',
      deleted: '⊘',
      blocked: '⊘',
      unknown: '?',
    };
    const resolved = Object.fromEntries(
      (Object.keys(nativeStatuses) as RenderStatus[]).map((status) => [
        status,
        resolveStatusGlyph(status),
      ]),
    );
    expect(resolved).toEqual(nativeStatuses);
    expect(resolveStatusGlyph('completed', '●')).toBe('●');
    expect(resolveStatusGlyph('completed', '')).toBe('');
  });

  it('uses required statusGlyph without styling and re-resolves kit lifecycle changes', () => {
    const first: ThothRenderKit = {
      ...kit,
      statusGlyph: (theme, status) =>
        theme.fg('success', theme.bold?.(`first:${status}`) ?? status),
    };
    const old = registerRenderKit(first, {});
    expect(resolveStatusGlyph('completed', '●')).toBe('first:completed');
    expect(resolveStatusGlyph('failed')).toBe('first:failed');

    const current = registerRenderKit(
      {
        ...first,
        statusGlyph: (theme, status) =>
          theme.fg('error', theme.strikethrough?.(`next:${status}`) ?? status),
      },
      {},
    );
    withdrawRenderKit(old);
    expect(resolveStatusGlyph('failed', 'native')).toBe('next:failed');
    withdrawRenderKit(current);
    expect(resolveStatusGlyph('failed', 'native')).toBe('native');
    expect(resolveStatusGlyph('failed')).toBe('✗');
  });

  it('keeps rendering with native status fallbacks when statusGlyph is buggy', () => {
    const implementations: ThothRenderKit['statusGlyph'][] = [
      ...[undefined, null, false, 42, {}, [], ['wrong shape']].map(
        (value) => () => value as string,
      ),
      () => {
        throw new Error('buggy status');
      },
    ];
    for (const statusGlyph of implementations) {
      registerRenderKit({ ...kit, statusGlyph }, {});
      expect(resolveStatusGlyph('completed', '●')).toBe('●');
      expect(resolveStatusGlyph('failed')).toBe('✗');
    }
  });

  it('exports distinct glyph and frame resolver types without changing required statusGlyph', () => {
    expectTypeOf<SemanticIconName>().toEqualTypeOf<
      SemanticGlyphName | SemanticFrameName
    >();
    expectTypeOf<SemanticFrameName>().toEqualTypeOf<
      'spinnerFrames' | 'workingFrames'
    >();
    expectTypeOf(resolveIcon).toEqualTypeOf<
      (name: SemanticGlyphName, fallback?: string) => string
    >();
    expectTypeOf(resolveFrames).toEqualTypeOf<
      (
        name: SemanticFrameName,
        fallback?: readonly string[],
      ) => readonly string[]
    >();
    expectTypeOf(resolveStatusGlyph).toEqualTypeOf<
      (status: RenderStatus, fallback?: string) => string
    >();
    expectTypeOf<ThothRenderKit['statusGlyph']>().toEqualTypeOf<
      (theme: RenderKitTheme, status: RenderStatus) => string
    >();
    expectTypeOf<NonNullable<ThothRenderKit['icon']>>().toEqualTypeOf<
      (name: SemanticIconName) => string | readonly string[]
    >();
  });

  it('resolves native and caller-owned motion frames from the current kit', () => {
    const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const working = ['△', '◭', '▲', '◮'];
    const fallback = ['a', 'b'];
    expect(resolveFrames('spinnerFrames')).toEqual(spinner);
    expect(resolveFrames('workingFrames')).toEqual(working);
    expect(resolveFrames('spinnerFrames', fallback)).toBe(fallback);
    registerRenderKit(kit, {});
    expect(resolveFrames('spinnerFrames', fallback)).toBe(fallback);

    const themedSpinner = ['|', '/', '-', '\\'];
    const themedWorking = ['.', 'o', 'O', '0'];
    const first: ThothRenderKit = {
      ...kit,
      icon: (name) =>
        name === 'spinnerFrames' ? themedSpinner : themedWorking,
    };
    const old = registerRenderKit(first, {});
    expect(resolveFrames('spinnerFrames', fallback)).toBe(themedSpinner);
    expect(resolveFrames('workingFrames')).toBe(themedWorking);

    const current = registerRenderKit({ ...first, icon: () => ['next'] }, {});
    withdrawRenderKit(old);
    expect(resolveFrames('spinnerFrames', fallback)).toEqual(['next']);
    withdrawRenderKit(current);
    expect(resolveFrames('spinnerFrames', fallback)).toBe(fallback);
    expect(resolveFrames('workingFrames')).toEqual(working);
  });

  it.each(
    [
      undefined,
      null,
      false,
      42,
      {},
      [],
      [undefined],
      ['valid', 42],
      new Array(1),
    ].map((value, index) => ({ value, index })),
  )('falls back when a callable kit icon returns malformed data: $index', ({
    value,
  }) => {
    const malformed: ThothRenderKit = {
      ...kit,
      icon: () => value as string | readonly string[],
    };
    registerRenderKit(malformed, {});
    expect(getRenderKit()).toBe(malformed);
    expect(resolveIcon('selection', 'native')).toBe('native');
    expect(resolveIcon('selection')).toBe('›');
    expect(resolveFrames('workingFrames', ['native'])).toEqual(['native']);
    expect(resolveFrames('workingFrames')).toEqual(['△', '◭', '▲', '◮']);
  });

  it('falls back when a kit lookup supplies the other icon shape or throws', () => {
    registerRenderKit({ ...kit, icon: () => ['array'] }, {});
    expect(resolveIcon('separator', 'native')).toBe('native');
    registerRenderKit({ ...kit, icon: () => 'string' }, {});
    expect(resolveFrames('spinnerFrames', ['native'])).toEqual(['native']);
    registerRenderKit(
      {
        ...kit,
        icon() {
          throw new Error('buggy lookup');
        },
      },
      {},
    );
    expect(resolveIcon('separator', 'native')).toBe('native');
    expect(resolveIcon('separator')).toBe('·');
    expect(resolveFrames('spinnerFrames', ['native'])).toEqual(['native']);
    expect(resolveFrames('workingFrames')).toEqual(['△', '◭', '▲', '◮']);
  });

  it('uses the current kit icon across registration, replacement and withdrawal', () => {
    expect('icon' in kit).toBe(false);
    registerRenderKit(kit, {});
    expect(getRenderKit()).toBe(kit);
    expect(resolveIcon('arrowRight', 'native')).toBe('native');

    const first: ThothRenderKit = { ...kit, icon: () => 'first' };
    const old = registerRenderKit(first, {});
    expect(resolveIcon('arrowRight', 'native')).toBe('first');
    expect(resolveIcon('arrowRight')).toBe('first');

    const replacement: ThothRenderKit = { ...kit, icon: () => 'second' };
    const current = registerRenderKit(replacement, {});
    withdrawRenderKit(old);
    expect(resolveIcon('arrowRight', 'native')).toBe('second');
    withdrawRenderKit(current);
    expect(resolveIcon('arrowRight', 'native')).toBe('native');
    expect(resolveIcon('arrowRight')).toBe('→');
  });
});

describe('standard tool footer', () => {
  it('delegates untouched options to the current kit implementation', () => {
    const options: RenderToolFooterOptions = {
      status: 'running',
      context: { executionStarted: true, state: {} },
      elapsedMs: 5250,
      summary: 'partial output',
    };
    const toolFooter = vi.fn(() => '▲ · 5s');
    const themedKit: ThothRenderKit = { ...kit, toolFooter };
    expect(renderToolFooter(themedKit, theme, options)).toBe('▲ · 5s');
    expect(toolFooter).toHaveBeenCalledExactlyOnceWith(theme, options);
    expect(options.context?.state).toEqual({});
  });

  it('tracks execution and freezes terminal elapsed by status, not partial error flags', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const invalidate = vi.fn();
    const context = {
      executionStarted: true,
      isPartial: true,
      isError: true,
      state: {},
      invalidate,
    };
    expect(getToolElapsedMs({ status: 'running', context })).toBe(0);
    vi.setSystemTime(3500);
    expect(getToolElapsedMs({ status: 'in_progress', context })).toBe(2500);
    expect(
      renderToolFooter(undefined, theme, { status: 'running', context }),
    ).toBe('running · 2s');
    expect(getToolElapsedMs({ status: 'completed', context })).toBe(2500);
    vi.setSystemTime(9000);
    expect(getToolElapsedMs({ status: 'completed', context })).toBe(2500);
    expect(context.state).toEqual({
      startedAt: 1000,
      completedElapsedMs: 2500,
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'pending',
    'queued',
    'stopping',
    'unknown',
  ] as const)('does not freeze elapsed for %s', (status) => {
    vi.useFakeTimers();
    vi.setSystemTime(2000);
    const context = {
      state: { startedAt: 1000 },
      isPartial: false,
      isError: true,
    };
    expect(getToolElapsedMs({ status, context })).toBe(1000);
    vi.setSystemTime(4000);
    expect(getToolElapsedMs({ status, context })).toBe(3000);
    expect(context.state).toEqual({ startedAt: 1000 });
  });

  it('does not invent a start time without an executing running context and shared state', () => {
    const context = { executionStarted: false, state: {}, isPartial: true };
    expect(getToolElapsedMs({ status: 'running', context })).toBeUndefined();
    expect(
      getToolElapsedMs({
        status: 'running',
        context: { executionStarted: true },
      }),
    ).toBeUndefined();
    expect(context.state).toEqual({});
  });

  it.each([
    { state: {}, expected: undefined, footer: '✗ · Error' },
    {
      state: { startedAt: 'unknown' },
      expected: undefined,
      footer: '✗ · Error',
    },
    {
      state: { startedAt: Number.NaN },
      expected: undefined,
      footer: '✗ · Error',
    },
    {
      state: { startedAt: Number.POSITIVE_INFINITY },
      expected: undefined,
      footer: '✗ · Error',
    },
    {
      state: { completedElapsedMs: Number.NaN },
      expected: undefined,
      footer: '✗ · Error',
    },
    {
      state: { completedElapsedMs: Number.POSITIVE_INFINITY },
      expected: undefined,
      footer: '✗ · Error',
    },
    {
      state: { completedElapsedMs: -500 },
      expected: 0,
      footer: '✗ · 0s · Error',
    },
  ])('handles unavailable or malformed context timing: $state', ({
    state,
    expected,
    footer,
  }) => {
    const options: RenderToolFooterOptions = {
      status: 'failed',
      context: { state, executionStarted: true },
      summary: 'Error',
    };
    expect(getToolElapsedMs(options)).toBe(expected);
    expect(renderToolFooter(undefined, theme, options)).toBe(footer);
  });

  it('freezes a terminal authoritative elapsed override for later context-only renders', () => {
    const context = { state: { startedAt: 1000, completedElapsedMs: 5000 } };
    expect(getToolElapsedMs({ status: 'failed', context, elapsedMs: 0 })).toBe(
      0,
    );
    expect(getToolElapsedMs({ status: 'failed', context })).toBe(0);
  });

  it('renders whole-second running elapsed without a kit or terminal summary', () => {
    expect(
      renderToolFooter(undefined, theme, {
        status: 'running',
        elapsedMs: 5250,
        summary: 'partial output',
      }),
    ).toBe('running · 5s');
  });

  it.each([
    [undefined, 'running'],
    [Number.NaN, 'running'],
    [Number.POSITIVE_INFINITY, 'running'],
    [Number.NEGATIVE_INFINITY, 'running'],
    [-500, 'running · 0s'],
    [0, 'running · 0s'],
    [999, 'running · 0s'],
  ] as const)('omits unknown elapsed and clamps finite durations: %s', (elapsedMs, expected) => {
    expect(
      renderToolFooter(undefined, theme, { status: 'running', elapsedMs }),
    ).toBe(expected);
  });

  it.each([
    ['completed', '✓ · 5s · Exit 0 · 1 line'],
    ['deleted', '✓ · 5s · Exit 0 · 1 line'],
    ['failed', '✗ · 5s · Exit 0 · 1 line'],
    ['cancelled', '✗ · 5s · Exit 0 · 1 line'],
    ['interrupted', '✗ · 5s · Exit 0 · 1 line'],
    ['blocked', '✗ · 5s · Exit 0 · 1 line'],
    ['in_progress', 'running · 5s'],
    ['pending', 'pending · 5s'],
    ['queued', 'queued · 5s'],
    ['stopping', 'stopping · 5s'],
    ['unknown', 'unknown · 5s'],
  ] as const)('formats %s without a kit', (status, expected) => {
    expect(
      renderToolFooter(undefined, theme, {
        status,
        elapsedMs: 5999,
        summary: ['', 'Exit 0', '1 line', ''],
      }),
    ).toBe(expected);
  });
});

describe('render kit memo', () => {
  it('reuses lines at the same width and kit without rebuilding', () => {
    registerRenderKit(kit, {});
    const memo = createKitRenderMemo();
    const lines = ['card'];
    const build = vi.fn(() => lines);

    expect(memo.render(80, build)).toBe(lines);
    expect(memo.render(80, build)).toBe(lines);
    expect(build).toHaveBeenCalledExactlyOnceWith(kit);
  });

  it('rebuilds when the width changes', () => {
    registerRenderKit(kit, {});
    const memo = createKitRenderMemo();
    const build = vi.fn(() => ['card']);
    const first = memo.render(80, build);
    const resized = memo.render(100, build);

    expect(resized).toEqual(['card']);
    expect(resized).not.toBe(first);
    expect(memo.render(100, build)).toBe(resized);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('rebuilds when a kit is registered, replaced or withdrawn', () => {
    const memo = createKitRenderMemo();
    const build = vi.fn((current: ThothRenderKit | undefined) => [
      current ? 'kit card' : 'native shell',
    ]);
    const native = memo.render(80, build);
    expect(native).toEqual(['native shell']);

    registerRenderKit(kit, {});
    const card = memo.render(80, build);
    expect(card).toEqual(['kit card']);
    expect(build).toHaveBeenLastCalledWith(kit);

    const replacement = { ...kit };
    const token = registerRenderKit(replacement, {});
    const replaced = memo.render(80, build);
    expect(replaced).toEqual(['kit card']);
    expect(replaced).not.toBe(card);
    expect(build).toHaveBeenLastCalledWith(replacement);

    withdrawRenderKit(token);
    const withdrawn = memo.render(80, build);
    expect(withdrawn).toEqual(['native shell']);
    expect(withdrawn).not.toBe(native);
    expect(memo.render(80, build)).toBe(withdrawn);
    expect(build).toHaveBeenLastCalledWith(undefined);
    expect(build).toHaveBeenCalledTimes(4);
  });

  it.each([
    { label: 'present', current: kit },
    { label: 'absent', current: undefined },
  ])('rebuilds after invalidation with kit $label', ({ current }) => {
    if (current) registerRenderKit(current, {});
    const memo = createKitRenderMemo();
    const build = vi.fn(() => ['card']);
    const first = memo.render(80, build);
    memo.invalidate();
    const rebuilt = memo.render(80, build);

    expect(rebuilt).toEqual(['card']);
    expect(rebuilt).not.toBe(first);
    expect(memo.render(80, build)).toBe(rebuilt);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('looks up the kit on every render, including cache hits', () => {
    const version = vi.fn(() => 1 as const);
    const observedKit: ThothRenderKit = {
      ...kit,
      get version() {
        return version();
      },
    };
    registerRenderKit(observedKit, {});
    const memo = createKitRenderMemo();
    const build = vi.fn(() => ['card']);

    memo.render(80, build);
    memo.render(80, build);

    expect(version).toHaveBeenCalledTimes(2);
    expect(build).toHaveBeenCalledExactlyOnceWith(observedKit);
  });

  it('reuses empty output when no kit is registered', () => {
    const memo = createKitRenderMemo();
    const build = vi.fn(() => []);
    const empty = memo.render(80, build);

    expect(empty).toEqual([]);
    expect(memo.render(80, build)).toBe(empty);
    expect(build).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
