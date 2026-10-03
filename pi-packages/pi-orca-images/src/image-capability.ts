import {
  getCapabilities,
  setCapabilityOverrides,
} from '@earendil-works/pi-tui';
import { isOrcaImagesEnabled } from './environment.ts';

export function applyImageCapability(
  env: NodeJS.ProcessEnv = process.env,
  api = { getCapabilities, setCapabilityOverrides },
): void {
  if (!isOrcaImagesEnabled(env) || env.PI_IMAGE_PROTOCOL !== undefined) return;

  const capabilities = api.getCapabilities();
  if (capabilities.images !== null) return;

  // Prefer Kitty for Pi's image-ID redraw and cleanup support; Pi's native
  // image pass converts non-PNG results. The setter replaces overrides, so
  // retain the other effective capability flags.
  api.setCapabilityOverrides({ ...capabilities, images: 'kitty' });
}
