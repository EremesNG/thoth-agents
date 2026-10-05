import { beforeEach } from 'vitest';

beforeEach(async () => {
  const { __resetState } = await import('../state/store.js');
  __resetState();
});
