import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Box, Text } from '@earendil-works/pi-tui';
import { getRenderKit } from '@thoth-agents/pi-core';
import { Type } from 'typebox';

/** A package-owned producer discovering the kit on each SDK component render. */
export default function producer(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'kit_probe',
    label: 'Probe',
    description: 'Offline render-kit integration fixture',
    parameters: Type.Object({}),
    renderShell: 'self',
    renderCall(_args, theme) {
      return {
        invalidate() {},
        render(width) {
          const kit = getRenderKit();
          if (kit)
            return kit.card(
              theme,
              { title: 'Probe', body: ['kit active'] },
              width,
            );
          const box = new Box(1, 1, (text) => theme.bg('toolPendingBg', text));
          box.addChild(new Text('native fallback', 0, 0));
          return box.render(width);
        },
      };
    },
    async execute() {
      return { content: [{ type: 'text', text: 'done' }], details: {} };
    },
  });
}
