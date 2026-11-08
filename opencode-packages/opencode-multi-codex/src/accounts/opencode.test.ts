import type { Plugin } from '@opencode/plugin';
import { expect, it } from 'vitest';
import { openCodeCredentials } from './opencode.js';

it('lists only native openai credential connections and ignores environment connections', async () => {
  let environmentActive = false;
  const integration: Pick<
    Plugin.Context['integration'],
    'list' | 'connection'
  > = {
    list: async () => ({
      location: { directory: '/project' },
      data: [
        {
          id: 'other',
          name: 'Other',
          methods: [],
          connections: [
            {
              type: 'credential',
              id: 'foreign',
              label: 'Other',
              method: 'oauth',
            },
          ],
        },
        {
          id: 'openai',
          name: 'OpenAI',
          methods: [],
          connections: [
            { type: 'env', name: 'OPENAI_API_KEY' },
            { type: 'credential', id: 'a', label: 'Personal', method: 'oauth' },
          ],
        },
      ],
    }),
    connection: {
      active: async (id) => {
        expect(id).toBe('openai');
        return environmentActive
          ? { type: 'env', name: 'OPENAI_API_KEY' }
          : { type: 'credential', id: 'a', label: 'Personal', method: 'oauth' };
      },
      resolve: async () => {
        throw new Error('must not access tokens');
      },
      status: async () => {
        throw new Error('must not mutate credentials');
      },
    },
  };
  expect(await openCodeCredentials(integration).snapshot()).toEqual({
    credentials: [{ id: 'a', label: 'Personal' }],
    activeCredentialID: 'a',
  });
  environmentActive = true;
  expect(await openCodeCredentials(integration).snapshot()).toEqual({
    credentials: [{ id: 'a', label: 'Personal' }],
    activeCredentialID: undefined,
  });
});
