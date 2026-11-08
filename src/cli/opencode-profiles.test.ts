import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LEGACY_OPENAI_PRESET } from '../config/constants';
import {
  effectiveOpenCodeProfile,
  openCodeProfileStore,
  syncOpenCodeProfile,
} from './opencode-profiles';
import { MODEL_MAPPINGS } from './providers';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'thoth-cli-profiles-'));
  vi.stubEnv('OPENCODE_CONFIG_DIR', root);
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it('matches runtime scalar and array pairs through root and profile inheritance', () => {
  const config = {
    agents: {
      worker: {
        model: ['p/base', { id: 'p/backup', variant: 'low' }],
        variant: 'high',
      },
      oracle: { model: [{ id: 'p/oracle', variant: 'low' }], variant: 'high' },
      librarian: { model: 'p/librarian' },
      designer: { variant: 'low' },
    },
  };
  expect(effectiveOpenCodeProfile(config).agents).toMatchObject({
    worker: { model: 'p/base' },
    oracle: { model: 'p/oracle', variant: 'low' },
    librarian: { model: 'p/librarian' },
    designer: { model: 'openai/gpt-6-luna', variant: 'low' },
  });
  expect(effectiveOpenCodeProfile(config).agents.worker).not.toHaveProperty(
    'variant',
  );
  expect(effectiveOpenCodeProfile(config).agents.librarian).not.toHaveProperty(
    'variant',
  );
  const store = openCodeProfileStore();
  store.save('global', 'custom', {
    agents: {
      worker: { variant: 'max' },
      oracle: { model: 'p/new' },
    },
  });
  store.setGlobalActive('custom');
  expect(effectiveOpenCodeProfile(config).agents.worker).toEqual({
    model: 'p/base',
    variant: 'max',
  });
  expect(effectiveOpenCodeProfile(config).agents.oracle).toEqual({
    model: 'p/new',
  });
});

it('advances previous shipped pairs in openai and the active agents roster, preserving overrides and unrelated profiles', () => {
  const store = openCodeProfileStore();
  const previous = {
    agents: Object.fromEntries(
      Object.entries(LEGACY_OPENAI_PRESET).map(([role, value]) => [
        role,
        { model: `openai/${value.model}`, variant: value.effort },
      ]),
    ),
  };
  store.save('global', 'openai', previous);
  const applied = structuredClone(previous);
  applied.agents.worker = { model: 'custom/worker', variant: 'high' };
  // Same legacy model, different effort is also an operator override.
  applied.agents.designer.variant = 'low';
  store.save('global', 'agents', applied);
  store.save('global', 'personal', previous);
  store.setGlobalActive('agents');
  syncOpenCodeProfile();
  const document = store.read('global');
  expect(document.active).toBe('agents');
  expect(document.profiles.openai.agents).toEqual(MODEL_MAPPINGS.openai);
  expect(document.profiles.agents.agents.oracle).toEqual({
    model: 'openai/gpt-6.1-sol',
    variant: 'xhigh',
  });
  expect(document.profiles.agents.agents.worker).toEqual({
    model: 'custom/worker',
    variant: 'high',
  });
  expect(document.profiles.agents.agents.designer).toEqual(
    applied.agents.designer,
  );
  expect(document.profiles.personal).toEqual(previous);
});
