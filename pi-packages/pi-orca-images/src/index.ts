import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  installAltScreenImageFocus,
  installAltScreenImageOrder,
} from './alt-screen-image-order.ts';
import { applyImageCapability } from './image-capability.ts';
import { installImageDownscale } from './image-downscale.ts';

export default function orcaImages(pi: ExtensionAPI): void {
  installAltScreenImageOrder();
  installAltScreenImageFocus();
  installImageDownscale();

  pi.on('session_start', () => {
    // Pi replaces capability overrides after loading extensions.
    applyImageCapability();
  });
  pi.on('agent_start', () => {
    // Native /reload resets overrides after session_start. agent_start is
    // awaited before messages/tools, once per loop (including continuations).
    applyImageCapability();
  });
}
