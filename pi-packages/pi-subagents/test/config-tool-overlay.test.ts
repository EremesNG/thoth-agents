import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { loadSubagents, parseToolOverlay } from '../src/config.js';

let root: string;
let cwd: string;
let agentDir: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-tool-overlay-'));
  cwd = path.join(root, 'project');
  agentDir = path.join(root, 'agent');
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  fs.mkdirSync(path.join(agentDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(cwd, '.pi'), { recursive: true });
  fs.writeFileSync(
    path.join(agentDir, 'agents', 'worker.md'),
    '---\ntools: read\n---\nManaged instructions',
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

it('attaches project tools to the winning definition without changing its base', () => {
  fs.writeFileSync(
    path.join(cwd, '.pi', 'subagents.json'),
    JSON.stringify({
      agents: {
        worker: { tools: { add: ['mcp__blender*'], remove: ['read'] } },
      },
    }),
  );
  expect(loadSubagents(cwd)[0]).toMatchObject({
    tools: ['read'],
    instructions: 'Managed instructions',
    scope: 'global',
    toolOverlay: { add: ['mcp__blender*'], remove: ['read'] },
  });
});

it.each([
  {
    tools: {
      add: ['read', 5, '', '   ', '@active'],
      remove: [null, 'bash', '@active'],
    },
    expected: { add: ['read'], remove: ['bash'] },
  },
  {
    tools: { add: 'read', remove: ['bash'] },
    expected: { add: [], remove: ['bash'] },
  },
  { tools: [], expected: undefined },
  { tools: null, expected: undefined },
  { tools: 'read', expected: undefined },
])('ignores invalid overlay shapes and entries with a debug diagnostic: $tools', ({
  tools,
  expected,
}) => {
  fs.writeFileSync(
    path.join(cwd, '.pi', 'subagents.json'),
    JSON.stringify({
      debug: true,
      agents: { worker: { tools } },
    }),
  );
  expect(loadSubagents(cwd)[0].toolOverlay).toEqual(expected);
  expect(
    fs.readFileSync(path.join(cwd, '.pi', 'subagents-debug.log'), 'utf8'),
  ).toContain('agents.worker.tools');
});

it('does not read global or ancestor overlays, including when project configuration is absent', () => {
  const overlay = { agents: { worker: { tools: { add: ['bash'] } } } };
  fs.writeFileSync(
    path.join(agentDir, 'subagents.json'),
    JSON.stringify(overlay),
  );
  fs.mkdirSync(path.join(root, '.pi'));
  fs.writeFileSync(
    path.join(root, '.pi', 'subagents.json'),
    JSON.stringify(overlay),
  );
  expect(loadSubagents(cwd)[0].toolOverlay).toBeUndefined();
});

it('applies optional arrays to a project winner after defaults are inherited', () => {
  fs.mkdirSync(path.join(cwd, '.pi', 'subagents'));
  fs.writeFileSync(
    path.join(cwd, '.pi', 'subagents', 'worker.md'),
    'Project body',
  );
  fs.writeFileSync(
    path.join(cwd, '.pi', 'subagents.json'),
    JSON.stringify({
      default_tools: ['read'],
      agents: { worker: { tools: { remove: ['read'] } } },
    }),
  );
  expect(loadSubagents(cwd)[0]).toMatchObject({
    instructions: 'Project body',
    tools: ['read'],
    scope: 'project',
    toolOverlay: { add: [], remove: ['read'] },
  });
});

it('preserves valid overlay entries verbatim for lossless panel drafts', () => {
  expect(
    parseToolOverlay({ add: ['read', 'read', ' mcp__* '], remove: [] }),
  ).toEqual({
    add: ['read', 'read', ' mcp__* '],
    remove: [],
  });
  expect(parseToolOverlay({})).toEqual({ add: [], remove: [] });
});

it.each([
  { agents: [] },
  { agents: { worker: null } },
])('ignores malformed agent containers with diagnostics: %o', (raw) => {
  fs.writeFileSync(
    path.join(cwd, '.pi', 'subagents.json'),
    JSON.stringify({ debug: true, ...raw }),
  );
  expect(loadSubagents(cwd)[0].toolOverlay).toBeUndefined();
  expect(
    fs.readFileSync(path.join(cwd, '.pi', 'subagents-debug.log'), 'utf8'),
  ).toContain('tool-overlay');
});
