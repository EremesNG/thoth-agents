import { expect, it } from 'vitest';
import { panelLingerEndsAt } from '../src/panel.js';

it('exports the host finished-row linger boundaries for other panel consumers', () => {
  expect(
    panelLingerEndsAt({
      id: 'done',
      primary: 'done',
      state: 'done',
      endedAt: 1000,
    }),
  ).toBe(11_000);
  expect(
    panelLingerEndsAt({
      id: 'failed',
      primary: 'failed',
      state: 'failed',
      endedAt: 1000,
    }),
  ).toBe(31_000);
  expect(
    panelLingerEndsAt({ id: 'live', primary: 'live', state: 'running' }),
  ).toBeUndefined();
});
