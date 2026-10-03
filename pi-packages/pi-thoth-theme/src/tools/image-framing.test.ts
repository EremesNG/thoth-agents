import type {
  AgentToolResult,
  ExtensionAPI,
  Theme,
  ToolRendererResolver,
} from '@earendil-works/pi-coding-agent';
import {
  initTheme,
  ToolExecutionComponent,
} from '@earendil-works/pi-coding-agent';
import {
  Image,
  resetCapabilitiesCache,
  setCapabilities,
  setCapabilityOverrides,
  type TUI,
} from '@earendil-works/pi-tui';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ThemeConfig } from '../shared/config.ts';
import { registerTools } from './index.ts';
import { createCustomReadTool } from './read.ts';

// Valid 1×1 red-pixel fixtures; the JPEG exercises Pi's real PNG conversion.
const imageFixtures = [
  {
    mimeType: 'image/png',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AP8AAP8FAAH/+lyI0QAAAABJRU5ErkJggg==',
  },
  {
    mimeType: 'image/jpeg',
    data: '/9j/4AAQSkZJRgABAgAAAQABAAD/wAARCAABAAEDAREAAhEBAxEB/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50r8KP9Uz/9k=',
  },
] as const;

const config: ThemeConfig = {
  icons: 'ascii',
  statusLine: { enabled: true, subscriptionProviders: ['claude-bridge'] },
  tools: { enabled: true },
  welcome: { enabled: true },
};

function imageResult(mimeType: string, data: string): AgentToolResult<unknown> {
  return {
    content: [
      { type: 'text', text: 'Read image file' },
      { type: 'image', mimeType, data },
    ],
    details: {},
  };
}

afterEach(() => {
  setCapabilityOverrides({});
  resetCapabilitiesCache();
});

describe.each(imageFixtures)('self-shell read of $mimeType', ({
  mimeType,
  data,
}) => {
  it.each([
    false,
    true,
  ])('leaves image content intact for Pi with expanded=%s', (expanded) => {
    const cwd = process.cwd();
    const read = createCustomReadTool(cwd, config);
    const result = imageResult(mimeType, data);
    const content = result.content;
    const image = content[1];
    const originalContent = structuredClone(content);
    const theme = {
      fg: (_color: string, text: string) => text,
      bg: (_color: string, text: string) => text,
      bold: (text: string) => text,
    } as Theme;
    const context = {
      args: { path: 'image' },
      toolCallId: 'read-image',
      invalidate: () => {},
      state: {},
      cwd,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded,
      showImages: true,
      isError: false,
    };

    expect(read.renderShell).toBe('self');
    read.renderCall(context.args, theme, context).render(80);
    const lines = read
      .renderResult(result, { expanded, isPartial: false }, theme, context)
      .render(80);

    expect(lines.join('\n')).toContain('Read image file');
    expect(result.content).toBe(content);
    expect(result.content[1]).toBe(image);
    expect(result.content).toEqual(originalContent);
  });

  describe('Pi native Kitty image pass', () => {
    let resolver: ToolRendererResolver | undefined;
    let dispose: () => void;
    beforeAll(() => {
      initTheme('dark', false);
      dispose = registerTools(
        {
          registerToolRenderer(registeredResolver: ToolRendererResolver) {
            resolver = registeredResolver;
          },
        } as unknown as ExtensionAPI,
        config,
      );
    });
    afterAll(() => dispose());

    it('adds and renders an Image child after the self-shell text, honoring showImages', async () => {
      setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });

      const cwd = process.cwd();
      const read = resolver?.('read', () => undefined);
      if (!read) throw new Error('Themed read renderers were not registered');
      const result = imageResult(mimeType, data);
      const content = result.content;
      const originalContent = structuredClone(content);
      // The UI boundary signals when Pi's asynchronous JPEG conversion finishes.
      let requestRender = () => {};
      const renderRequested = new Promise<void>((resolve) => {
        requestRender = resolve;
      });
      const ui = { requestRender } as TUI;
      const component = new ToolExecutionComponent(
        'read',
        'read-image',
        { path: 'image' },
        { showImages: true },
        read,
        ui,
        cwd,
      );

      expect(read.renderShell).toBe('self');
      component.updateResult({ ...result, isError: false });
      if (mimeType !== 'image/png') await renderRequested;

      expect(
        component.children.filter((child) => child instanceof Image),
      ).toHaveLength(1);
      const lines = component.render(80);
      expect(lines.join('\n')).toContain('Read image file');
      const imageLine = lines.findIndex((line) => line.includes('\x1b_G'));
      expect(imageLine).toBeGreaterThan(
        lines.findIndex((line) => line.includes('Read image file')),
      );
      expect(result.content).toBe(content);
      expect(result.content).toEqual(originalContent);

      component.setExpanded(true);
      expect(component.render(80).join('\n')).toContain('\x1b_G');
      component.setShowImages(false);
      expect(component.children.some((child) => child instanceof Image)).toBe(
        false,
      );
      expect(component.render(80).join('\n')).not.toContain('\x1b_G');
      component.setShowImages(true);
      expect(
        component.children.filter((child) => child instanceof Image),
      ).toHaveLength(1);
      expect(component.render(80).join('\n')).toContain('\x1b_G');
      expect(result.content).toEqual(originalContent);
    });
  });
});
