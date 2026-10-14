import { expect, it } from 'vitest';
import {
  SESSION_MODEL_PROFILE_ENTRY,
  SessionModelProfile,
} from '../../src/model-profiles/session.js';

it('persists selection and explicit clearing as custom entries and restores the latest selection', () => {
  const entries: any[] = [];
  const binding = new SessionModelProfile((customType, data) =>
    entries.push({ type: 'custom', customType, data }),
  );
  binding.set('fast');
  expect(binding.get()).toBe('fast');
  expect(entries[0]).toEqual({
    type: 'custom',
    customType: SESSION_MODEL_PROFILE_ENTRY,
    data: { profile: 'fast' },
  });
  const resumed = new SessionModelProfile();
  resumed.restore(entries);
  expect(resumed.get()).toBe('fast');
  binding.set(undefined);
  resumed.restore(entries);
  expect(resumed.get()).toBeUndefined();
  resumed.restore([]);
  expect(resumed.get()).toBeUndefined();
});
