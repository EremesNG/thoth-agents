import {
  getCapabilities,
  resetCapabilitiesCache,
  setCapabilities,
  setCapabilityOverrides,
  type TerminalCapabilities,
} from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it } from 'vitest';
import { applyImageCapability } from './image-capability.ts';

afterEach(() => {
  setCapabilityOverrides({});
  resetCapabilitiesCache();
});

describe('Orca image capability', () => {
  it.each([
    'Orca',
    'orca',
    'ORCA',
    'oRcA',
  ])('enables Kitty in %s and preserves other flags', (terminal) => {
    setCapabilities({ images: null, trueColor: false, hyperlinks: true });

    applyImageCapability({ TERM_PROGRAM: terminal });
    resetCapabilitiesCache();

    expect(getCapabilities()).toEqual({
      images: 'kitty',
      trueColor: false,
      hyperlinks: true,
    });
  });

  it('leaves unrecognized terminals on the native text fallback', () => {
    const capabilities = { images: null, trueColor: true, hyperlinks: false };
    setCapabilities(capabilities);

    applyImageCapability({ TERM_PROGRAM: 'unknown' });

    expect(getCapabilities()).toBe(capabilities);
  });

  it.each([
    '/tmp/tmux-1000/default,123,0',
    '',
  ])('leaves Orca unchanged with TMUX=%j', (tmux) => {
    const capabilities = { images: null, trueColor: true, hyperlinks: false };
    setCapabilities(capabilities);

    applyImageCapability({ TERM_PROGRAM: 'Orca', TMUX: tmux });

    expect(getCapabilities()).toBe(capabilities);
  });

  it.each([
    'kitty',
    'iterm2',
    'none',
    'NONE',
    'nOnE',
    '0',
    '',
    'unknown',
  ])('respects explicit PI_IMAGE_PROTOCOL=%j', (protocol) => {
    const capabilities = { images: null, trueColor: true, hyperlinks: false };
    setCapabilities(capabilities);

    applyImageCapability({
      TERM_PROGRAM: 'Orca',
      PI_IMAGE_PROTOCOL: protocol,
    });

    expect(getCapabilities()).toBe(capabilities);
  });

  it.each([
    'kitty',
    'iterm2',
  ] as const)('preserves detected %s protocol', (protocol) => {
    const capabilities: TerminalCapabilities = {
      images: protocol,
      trueColor: false,
      hyperlinks: true,
    };
    setCapabilities(capabilities);

    applyImageCapability({ TERM_PROGRAM: 'Orca' });

    expect(getCapabilities()).toBe(capabilities);
  });
});
