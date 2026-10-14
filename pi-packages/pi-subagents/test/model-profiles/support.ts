import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { buildAgentRows } from '../../src/model-profiles/data.js';
import { ModelProfileWorkspace } from '../../src/model-profiles/editor.js';
import { ModelProfileStore } from '../../src/model-profiles/store.js';

export const KEYS = {
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  enter: '\r',
  esc: '\x1b',
} as const;

export const AVAILABLE_MODELS = [
  { provider: 'openai', id: 'gpt-5.5', label: 'GPT 5.5' },
  { provider: 'anthropic', id: 'claude-x', label: 'Claude X' },
];

export function stripAnsi(text: string): string {
  return text
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\u001b\][^\u001b]*(?:\u001b\|\u0007)/g, '');
}

export type ProfileEnv = {
  cwd: string;
  agentDir: string;
  store: ModelProfileStore;
  session: { value?: string; history: Array<string | undefined> };
  workspace(): ModelProfileWorkspace;
  ctx(extra?: Record<string, unknown>): Record<string, unknown>;
  writeProfiles(
    scope: 'global' | 'project',
    document: Record<string, unknown>,
  ): void;
  readFile(scope: 'global' | 'project'): any;
  cleanup(): void;
};

/** Isolated cwd/agentDir with two subagents (analyst, reviewer). */
export function createProfileEnv(): ProfileEnv {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-model-profiles-'));
  const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDir = path.join(tmp, 'agent');
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const cwd = path.join(tmp, 'project');
  fs.mkdirSync(path.join(cwd, '.pi', 'subagents'), { recursive: true });
  const agent = (name: string, extra = '') =>
    fs.writeFileSync(
      path.join(cwd, '.pi', 'subagents', `${name}.md`),
      `---
name: ${name}
description: ${name} agent
${extra}---
body`,
    );
  agent('analyst');
  agent('reviewer', 'model: anthropic/claude-x\neffort: high\n');
  const store = new ModelProfileStore({ cwd, agentDir });
  const session: ProfileEnv['session'] = { history: [] };
  const baseCtx = {
    cwd,
    agentDir,
    model: { provider: 'openai', id: 'gpt-5.5' },
    thinkingLevel: 'low',
    getSessionModelProfile: () => session.value,
    setSessionModelProfile: (name?: string) => {
      session.value = name;
      session.history.push(name);
    },
  };
  return {
    cwd,
    agentDir,
    store,
    session,
    ctx: (extra = {}) => ({ ...baseCtx, ...extra }),
    workspace: () =>
      new ModelProfileWorkspace(store, buildAgentRows(baseCtx), {
        get: baseCtx.getSessionModelProfile,
        set: baseCtx.setSessionModelProfile,
      }),
    writeProfiles: (scope, document) => {
      const file = store.paths[scope];
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ version: 1, ...document }));
    },
    readFile: (scope) =>
      JSON.parse(fs.readFileSync(store.paths[scope], 'utf8')),
    cleanup: () => {
      if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

/** Per-test environment; call inside a describe block. */
export function useProfileEnv(): () => ProfileEnv {
  let env: ProfileEnv;
  beforeEach(() => {
    env = createProfileEnv();
  });
  afterEach(() => env.cleanup());
  return () => env;
}
