import { panelVisibleWidth } from '@thoth-agents/pi-core/panel';
import { expect, it } from 'vitest';
import { truncateToVisibleWidth } from '../../src/model-profiles/formatting.js';

it('model profile truncation measures styled wide glyphs in terminal cells', () => {
  const clipped = truncateToVisibleWidth('\u001b[31m界abcdef\u001b[0m', 5);
  expect(clipped.replace(/\u001b\[[0-9;]*m/g, '')).toBe('界ab…');
  expect(panelVisibleWidth(clipped)).toBe(5);
});
