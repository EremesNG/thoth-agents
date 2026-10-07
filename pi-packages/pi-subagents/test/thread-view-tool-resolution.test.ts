import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  publishToolDefinitions,
  type RenderKitToken,
  registerRenderKit,
  type ThothRenderKit,
  type ToolDefinitionHandle,
  type ToolDefinitionLike,
  withdrawRenderKit,
} from '@thoth-agents/pi-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  preloadPiComponentsForSubagentRendering,
  registerSubagentExternalToolDefinition,
  registerSubagentRuntimeToolDefinition,
  renderThreadBody,
  resetPiComponentCacheForTests,
  setPiComponentProviderForSubagentRendering,
} from '../src/thread-view.js';
import type {
  SubagentTask,
  SubagentThreadRenderContext,
} from '../src/types.js';
import { resolveRegisteredToolDefinition } from '../src/ui/panel-overlay.js';
import { SubagentsHistoryPanel } from '../src/ui/subagents-history-panel.js';

type Definition = ToolDefinitionLike & {
  label?: string;
  description?: string;
  parameters?: unknown;
};

let tmp: string;
let kitToken: RenderKitToken | undefined;
let handles: ToolDefinitionHandle[];
let definitions: Definition[];
let oldArgv1: string;

function externalSource() {
  const source = path.join(tmp, 'external.cjs');
  const marker = path.join(tmp, 'source-evaluated');
  fs.writeFileSync(
    source,
    `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'evaluated');
    module.exports = pi => pi.registerTool({
      name: 'viewer_external',
      renderCall: () => ({ render: () => ['source renderer'] }),
    });`,
  );
  const packageRoot = path.join(tmp, 'fake-pi');
  fs.mkdirSync(path.join(packageRoot, 'node_modules', 'jiti'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: '@earendil-works/pi-coding-agent' }),
  );
  fs.writeFileSync(path.join(packageRoot, 'cli.js'), '');
  fs.writeFileSync(
    path.join(packageRoot, 'node_modules', 'jiti', 'package.json'),
    JSON.stringify({ main: 'index.cjs' }),
  );
  fs.writeFileSync(
    path.join(packageRoot, 'node_modules', 'jiti', 'index.cjs'),
    'exports.createJiti = () => require;',
  );
  process.argv[1] = path.join(packageRoot, 'cli.js');
  const info = {
    name: 'viewer_external',
    description: 'External metadata',
    parameters: { type: 'object' },
    sourceInfo: { path: source },
  };
  return { source, marker, info, pi: { getAllTools: () => [info] } };
}

function kit(
  resolveToolRenderers?: ThothRenderKit['resolveToolRenderers'],
): ThothRenderKit {
  return {
    version: 1,
    ...(resolveToolRenderers ? { resolveToolRenderers } : {}),
    card: () => [],
    collapse: (_theme, rows) => [...rows],
    cachedComponent: (render) => ({ render, invalidate() {} }),
    indicator: () => ({ glyph: '', elapsed: '', text: '' }),
    statusGlyph: () => '',
    widgetHeading: () => '',
    treeRow: (_theme, options) => options.text,
    fg: (_theme, _role, text) => text,
  };
}

function installKit(value: ThothRenderKit): void {
  kitToken = registerRenderKit(value, {});
}

function uninstallKit(): void {
  if (kitToken) withdrawRenderKit(kitToken);
  kitToken = undefined;
}

function publish(definition: Definition): ToolDefinitionHandle {
  const handle = publishToolDefinitions([definition]);
  handles.push(handle);
  return handle;
}

function renderers(text: string) {
  return {
    renderShell: 'self' as const,
    renderCall: () => ({ render: () => [text], invalidate() {} }),
  };
}

function renderTool(
  name: string,
  overrides: Partial<SubagentThreadRenderContext> = {},
): string {
  return renderThreadBody(
    {
      version: 1,
      source: 'events',
      items: [
        {
          type: 'tool',
          name,
          tool_call_id: 'call-1',
          status: 'running',
          arguments: {},
        },
      ],
    },
    {
      cwd: tmp,
      taskId: 'task-1',
      tui: { requestRender() {} },
      visibleWidth: (text) => text.length,
      truncateToWidth: (text, width) => text.slice(0, width),
      ...overrides,
    },
  ).join('\n');
}

function completedToolPanel(name: string): SubagentsHistoryPanel {
  const task: SubagentTask = {
    id: 'task-1',
    agent: 'worker',
    mode: 'task',
    status: 'completed',
    task: 'Render a completed tool card',
    created_at: '2026-01-01T00:00:00.000Z',
    ended_at: '2026-01-01T00:00:01.000Z',
    thread_snapshot: {
      version: 1,
      source: 'events',
      items: [
        {
          type: 'tool',
          name,
          tool_call_id: 'call-1',
          status: 'completed',
          arguments: {},
        },
      ],
    },
  };
  return new SubagentsHistoryPanel(
    [task],
    { fg: (_role: string, text: string) => text },
    () => {},
    () => false,
    (text) => text.length,
    (text, width) => text.slice(0, width),
    {
      cwd: tmp,
      tui: { requestRender() {} },
      getToolDefinition: (toolName) =>
        resolveRegisteredToolDefinition({}, {}, toolName),
    },
  );
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-viewer-tools-'));
  oldArgv1 = process.argv[1];
  handles = [];
  definitions = [];
  resetPiComponentCacheForTests();
  setPiComponentProviderForSubagentRendering({
    createReadToolDefinition: () => ({ name: 'read', label: 'Pi Read' }),
    ToolExecutionComponent: class {
      constructor(
        private name: string,
        _id: string,
        _args: unknown,
        _options: unknown,
        private definition: Definition,
      ) {
        definitions.push(definition);
      }
      render(width: number): string[] {
        return (
          this.definition.renderCall?.({}, {}, {}).render(width) ?? [
            `pi-default:${this.name}`,
          ]
        );
      }
    },
  });
});

afterEach(() => {
  uninstallKit();
  for (const handle of handles) handle.withdraw();
  resetPiComponentCacheForTests();
  process.argv[1] = oldArgv1;
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('viewer tool resolution', () => {
  it('updates completed panel cards after publication replacement without manual invalidation', () => {
    installKit(kit());
    const handle = publish({
      name: 'viewer_panel',
      ...renderers('first publication'),
    });
    const panel = completedToolPanel('viewer_panel');
    expect(panel.render(160).join('\n')).toContain('first publication');
    expect(panel.render(160).join('\n')).toContain('first publication');

    handle.publish([{ name: 'viewer_panel', ...renderers('new publication') }]);

    const rendered = panel.render(160).join('\n');
    expect(rendered).toContain('new publication');
    expect(rendered).not.toContain('first publication');
  });

  it('updates completed panel cards after publication withdrawal without manual invalidation', () => {
    installKit(kit());
    const handle = publish({
      name: 'viewer_panel',
      ...renderers('published card'),
    });
    const panel = completedToolPanel('viewer_panel');
    expect(panel.render(160).join('\n')).toContain('published card');
    expect(panel.render(160).join('\n')).toContain('published card');

    handle.withdraw();

    const rendered = panel.render(160).join('\n');
    expect(rendered).toContain('pi-default:viewer_panel');
    expect(rendered).not.toContain('published card');
  });

  it('updates completed panel cards after kit replacement without manual invalidation', () => {
    publish({ name: 'viewer_panel', ...renderers('native card') });
    installKit(kit(() => renderers('first kit card')));
    const panel = completedToolPanel('viewer_panel');
    expect(panel.render(160).join('\n')).toContain('first kit card');
    expect(panel.render(160).join('\n')).toContain('first kit card');

    installKit(kit(() => renderers('replacement kit card')));

    const rendered = panel.render(160).join('\n');
    expect(rendered).toContain('replacement kit card');
    expect(rendered).not.toContain('first kit card');
  });

  it('updates completed panel cards after kit withdrawal without manual invalidation', () => {
    publish({ name: 'viewer_panel', ...renderers('native card') });
    installKit(kit(() => renderers('kit card')));
    const panel = completedToolPanel('viewer_panel');
    expect(panel.render(160).join('\n')).toContain('kit card');
    expect(panel.render(160).join('\n')).toContain('kit card');

    uninstallKit();

    const rendered = panel.render(160).join('\n');
    expect(rendered).toContain('native card');
    expect(rendered).not.toContain('kit card');
  });

  it('passes composed built-in renderers and self shell to the real Pi component', async () => {
    const { initTheme } = await import('@earendil-works/pi-coding-agent');
    const { Text } = await import('@earendil-works/pi-tui');
    initTheme('dark', false);
    setPiComponentProviderForSubagentRendering(undefined);
    expect(await preloadPiComponentsForSubagentRendering()).toBe(true);
    installKit(
      kit((name) => ({
        renderShell: 'self',
        renderCall: () => new Text(`native kit card:${name}`),
      })),
    );

    expect(
      renderTool('read')
        .replace(/\u001b\[[0-9;]*m/g, '')
        .trim(),
    ).toBe('native kit card:read');
  });

  it('renders built-in tools through kit-resolved renderers while preserving the Pi definition', () => {
    const resolver = vi.fn<NonNullable<ThothRenderKit['resolveToolRenderers']>>(
      (name, next) => {
        expect(name).toBe('read');
        expect(next()).toBeUndefined();
        return renderers('themed read card');
      },
    );
    installKit(kit(resolver));

    expect(renderTool('read')).toContain('themed read card');
    expect(definitions[0]).toMatchObject({
      name: 'read',
      label: 'Pi Read',
      renderShell: 'self',
    });
    expect(resolver).toHaveBeenCalledOnce();
  });

  it.each([
    'accessor',
    'external',
    'runtime',
  ] as const)('offers renderer-only downstream access to cheap %s definitions', (source) => {
    const downstream = renderers('cheap downstream');
    const definition = {
      name: 'viewer_cheap',
      label: 'Cheap Metadata',
      ...downstream,
    };
    const overrides: Partial<SubagentThreadRenderContext> = {};
    if (source === 'accessor') overrides.getToolDefinition = () => definition;
    if (source === 'external')
      registerSubagentExternalToolDefinition(definition.name, definition);
    if (source === 'runtime')
      registerSubagentRuntimeToolDefinition(
        'task-1',
        definition.name,
        definition,
      );
    installKit(
      kit((name, next) => {
        expect(name).toBe('viewer_cheap');
        expect(next()).toEqual(downstream);
        return next();
      }),
    );

    expect(renderTool('viewer_cheap', overrides)).toContain('cheap downstream');
    expect(definitions[0]?.label).toBe('Cheap Metadata');
  });

  it('rebuilds components on kit replacement and withdrawal while resolving at every render', () => {
    publish({ name: 'viewer_swap', ...renderers('native downstream') });
    const first = vi.fn(() => renderers('first kit'));
    installKit(kit(first));
    expect(renderTool('viewer_swap')).toContain('first kit');
    expect(renderTool('viewer_swap')).toContain('first kit');
    expect(first).toHaveBeenCalledTimes(2);
    expect(definitions).toHaveLength(1);

    installKit(kit(() => renderers('replacement kit')));
    expect(renderTool('viewer_swap')).toContain('replacement kit');
    expect(definitions).toHaveLength(2);

    uninstallKit();
    expect(renderTool('viewer_swap')).toContain('native downstream');
    expect(definitions).toHaveLength(3);
  });

  it('uses published renderers with a legacy kit without examining external sources', () => {
    const external = externalSource();
    const definition = {
      ...external.info,
      ...renderers('published native card'),
    };
    publish(definition);
    installKit(kit());
    const exists = vi.spyOn(fs, 'existsSync');
    const getToolDefinition = vi.fn((name: string) =>
      resolveRegisteredToolDefinition({}, external.pi, name),
    );

    expect(renderTool('viewer_external', { getToolDefinition })).toContain(
      'published native card',
    );
    expect(definitions[0]).toMatchObject(definition);
    expect(getToolDefinition).not.toHaveBeenCalled();
    expect(exists).not.toHaveBeenCalledWith(external.source);
    expect(fs.existsSync(external.marker)).toBe(false);
  });

  it.each([
    'legacy kit',
    'no kit',
  ])('uses the expected external-tool fallback with %s', (state) => {
    const external = externalSource();
    if (state === 'legacy kit') installKit(kit());
    const exists = vi.spyOn(fs, 'existsSync');
    const text = renderTool('viewer_external', {
      getToolDefinition: (name) =>
        resolveRegisteredToolDefinition({}, external.pi, name),
    });

    if (state === 'legacy kit') {
      expect(text).toContain('pi-default:viewer_external');
      expect(exists).not.toHaveBeenCalledWith(external.source);
      expect(fs.existsSync(external.marker)).toBe(false);
    } else {
      expect(text).toContain('source renderer');
      expect(exists).toHaveBeenCalledWith(external.source);
      expect(fs.existsSync(external.marker)).toBe(true);
    }
  });

  it('invalidates rehydrated source definitions on registry changes and kit transitions', () => {
    const external = externalSource();
    fs.writeFileSync(external.marker, 'first source definition');
    fs.writeFileSync(
      external.source,
      `module.exports = pi => {
        const text = require('node:fs').readFileSync(${JSON.stringify(external.marker)}, 'utf8');
        pi.registerTool({ name: 'viewer_external', renderCall: () => ({ render: () => [text] }) });
      };`,
    );
    const getToolDefinition = (name: string) =>
      resolveRegisteredToolDefinition({}, external.pi, name);
    expect(renderTool('viewer_external', { getToolDefinition })).toContain(
      'first source definition',
    );

    fs.writeFileSync(external.marker, 'updated source definition');
    publish({ name: 'viewer_unrelated' });
    expect(renderTool('viewer_external', { getToolDefinition })).toContain(
      'updated source definition',
    );

    installKit(
      kit((_name, next) => {
        expect(next()).toBeUndefined();
        return renderers('generic kit fallback');
      }),
    );
    const exists = vi.spyOn(fs, 'existsSync');
    expect(renderTool('viewer_external', { getToolDefinition })).toContain(
      'generic kit fallback',
    );
    expect(exists).not.toHaveBeenCalledWith(external.source);

    fs.writeFileSync(external.marker, 'source after kit withdrawal');
    uninstallKit();
    expect(renderTool('viewer_external', { getToolDefinition })).toContain(
      'source after kit withdrawal',
    );
  });

  it('uses renderer-bearing getAllTools entries cheaply behind published metadata', () => {
    publish({ name: 'viewer_metadata', label: 'Published Metadata' });
    const downstream = renderers('tool info call');
    installKit(kit((_name, next) => next()));
    const pi = {
      getAllTools: () => [{ name: 'viewer_metadata', ...downstream }],
    };

    expect(
      renderTool('viewer_metadata', {
        getToolDefinition: (name) =>
          resolveRegisteredToolDefinition({}, pi, name),
      }),
    ).toContain('tool info call');
    expect(definitions[0]?.label).toBe('Published Metadata');
  });

  it('uses published definitions before cheap accessors even without a kit', () => {
    const definition = { name: 'viewer_metadata', label: 'Published Metadata' };
    publish(definition);
    const getToolDefinition = vi.fn(() => ({
      name: 'viewer_metadata',
      ...renderers('lower priority accessor'),
    }));

    expect(renderTool('viewer_metadata', { getToolDefinition })).toContain(
      'pi-default:viewer_metadata',
    );
    expect(definitions[0]).toBe(definition);
    expect(getToolDefinition).not.toHaveBeenCalled();
  });

  it('uses cheap panel accessors for published metadata-only tools without replacing their metadata', () => {
    publish({ name: 'viewer_metadata', label: 'Published Metadata' });
    const downstream = renderers('panel accessor call');
    installKit(kit((_name, next) => next()));
    const pi = {
      getToolDefinition: () => ({ name: 'viewer_metadata', ...downstream }),
    };

    expect(
      renderTool('viewer_metadata', {
        getToolDefinition: (name) =>
          resolveRegisteredToolDefinition({}, pi, name),
      }),
    ).toContain('panel accessor call');
    expect(definitions[0]?.label).toBe('Published Metadata');
  });

  it('finds a registered cheap renderer behind metadata-only getAllTools accessors', () => {
    const external = externalSource();
    const cached = {
      name: 'viewer_external',
      ...renderers('registered cheap call'),
    };
    installKit(kit((_name, next) => next()));
    const pi = {
      ...external.pi,
      tools: new Map([['viewer_external', cached]]),
    };

    expect(
      renderTool('viewer_external', {
        getToolDefinition: (name) =>
          resolveRegisteredToolDefinition({}, pi, name),
      }),
    ).toContain('registered cheap call');
    expect(fs.existsSync(external.marker)).toBe(false);
  });

  it('keeps published metadata while finding downstream renderers in a cheap accessor', () => {
    publish({ name: 'viewer_metadata', label: 'Published Metadata' });
    const downstream = renderers('cheap accessor call');
    installKit(
      kit((name, next) => {
        expect(name).toBe('viewer_metadata');
        expect(next()).toEqual(downstream);
        return next();
      }),
    );

    expect(
      renderTool('viewer_metadata', {
        getToolDefinition: () => ({ name: 'viewer_metadata', ...downstream }),
      }),
    ).toContain('cheap accessor call');
    expect(definitions[0]?.label).toBe('Published Metadata');
  });

  it('keeps cheap cached renderers with a legacy kit even when the accessor only has metadata', () => {
    const external = externalSource();
    const exists = vi.spyOn(fs, 'existsSync');
    registerSubagentRuntimeToolDefinition('task-1', 'viewer_external', {
      name: 'viewer_external',
      ...renderers('captured runtime call'),
    });
    installKit(kit());

    expect(
      renderTool('viewer_external', {
        getToolDefinition: (name) =>
          resolveRegisteredToolDefinition({}, external.pi, name),
      }),
    ).toContain('captured runtime call');
    expect(exists).not.toHaveBeenCalledWith(external.source);
    expect(fs.existsSync(external.marker)).toBe(false);
  });

  it('rebuilds running tool components when published definitions change or are withdrawn', () => {
    installKit(kit());
    const handle = publish({
      name: 'viewer_replaced',
      ...renderers('first publication'),
    });
    expect(renderTool('viewer_replaced')).toContain('first publication');
    expect(renderTool('viewer_replaced')).toContain('first publication');
    expect(definitions).toHaveLength(1);

    handle.publish([
      { name: 'viewer_replaced', ...renderers('new publication') },
    ]);
    expect(renderTool('viewer_replaced')).toContain('new publication');
    expect(definitions).toHaveLength(2);

    handle.withdraw();
    expect(renderTool('viewer_replaced')).toContain(
      'pi-default:viewer_replaced',
    );
    expect(definitions).toHaveLength(3);
  });

  it('renders uncached external metadata via the kit without inspecting or evaluating its source', () => {
    const external = externalSource();
    const exists = vi.spyOn(fs, 'existsSync');
    const resolver = vi.fn<NonNullable<ThothRenderKit['resolveToolRenderers']>>(
      (name, next) => {
        expect(name).toBe('viewer_external');
        expect(next()).toBeUndefined();
        return renderers('generic kit card');
      },
    );
    installKit(kit(resolver));

    expect(
      renderTool('viewer_external', {
        getToolDefinition: (name) =>
          resolveRegisteredToolDefinition({}, external.pi, name),
      }),
    ).toContain('generic kit card');
    expect(definitions[0]).toMatchObject(external.info);
    expect(resolver).toHaveBeenCalledOnce();
    expect(exists).not.toHaveBeenCalledWith(external.source);
    expect(fs.existsSync(external.marker)).toBe(false);
  });

  it('composes kit renderers over the published definition with renderer-only downstream access', () => {
    const downstream = renderers('published call');
    const definition = {
      name: 'viewer_published',
      label: 'Published Tool',
      description: 'Published metadata',
      parameters: { type: 'object' },
      ...downstream,
    };
    publish(definition);
    const resolver = vi.fn<NonNullable<ThothRenderKit['resolveToolRenderers']>>(
      (name, next) => {
        expect(name).toBe('viewer_published');
        expect(next()).toEqual(downstream);
        return renderers('kit call');
      },
    );
    installKit(kit(resolver));
    const getToolDefinition = vi.fn(() => ({
      name: 'viewer_published',
      label: 'Stale Accessor',
      ...renderers('stale call'),
    }));

    expect(renderTool('viewer_published', { getToolDefinition })).toContain(
      'kit call',
    );
    expect(definitions[0]).toMatchObject({
      label: 'Published Tool',
      description: 'Published metadata',
      parameters: { type: 'object' },
      renderShell: 'self',
    });
    expect(resolver).toHaveBeenCalledOnce();
    expect(getToolDefinition).not.toHaveBeenCalled();
    expect(
      resolveRegisteredToolDefinition(
        {},
        { getToolDefinition },
        definition.name,
      ),
    ).toBe(definition);
    expect(getToolDefinition).not.toHaveBeenCalled();
  });
});
