import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Plugin } from '@opencode/plugin';
import { expect, test, vi } from 'vitest';
import type { OpenCodeDependencies } from './context';
import { registerSkills } from './skills';

const names = [
  'thoth-init',
  'thoth-sdd',
  'thoth-constitution',
  'thoth-archive',
  'plan-reviewer',
];

test.each([
  false,
  true,
])('OpenCode 2.2.5 host order: config copies present = %s', async (hasCopies) => {
  const skills = new Map<string, Record<string, unknown>>();
  const add = vi.fn((skill) => skills.set(skill.id, skill));
  const update = vi.fn((id, edit) => edit(skills.get(id)));
  const transform = vi.fn(async (edit) =>
    edit({ get: (id: string) => skills.get(id), add, update }),
  );
  const ctx = { skill: { transform } } as unknown as Plugin.Context;
  const deps = { packageRoot: process.cwd() } as OpenCodeDependencies;
  await registerSkills(ctx, deps);
  await registerSkills(ctx, deps);
  expect(add).toHaveBeenCalledTimes(5);
  expect(update).toHaveBeenCalledTimes(5);

  // Pinned core: plugin/supervisor.ts:98-101 runs external packages before
  // plugin/internal.ts:269-283's post plugins. config/plugin/skill.ts:177-179
  // then adds discovered skills, overwriting same IDs (not an override API).
  if (hasCopies) {
    for (const name of names) {
      add({
        id: name,
        name,
        path: `/legacy/skills/${name}/SKILL.md`,
        description: `Legacy ${name}`,
        content: `Legacy ${name}`,
      });
    }
  }
  expect([...skills.keys()].sort()).toEqual([...names].sort());
  for (const name of names) {
    const path = hasCopies
      ? `/legacy/skills/${name}/SKILL.md`
      : resolve('skills', name, 'SKILL.md');
    const skill = skills.get(name);
    expect(skill).toMatchObject({
      id: name,
      name,
      path,
      description: expect.any(String),
    });
    expect(skill?.content).toBe(
      hasCopies
        ? `Legacy ${name}`
        : readFileSync(path, 'utf8')
            .split(/---\r?\n/)[2]
            .trim(),
    );
    expect(skill?.content).not.toMatch(/^---/);
  }
});

test.each([
  'missing',
  'malformed',
  'unreadable',
])('rejects %s bundled skills with their absolute path before registration', async (kind) => {
  const root = mkdtempSync(join(tmpdir(), 'thoth-skills-'));
  const transform = vi.fn();
  try {
    if (kind === 'unreadable') {
      mkdirSync(join(root, 'skills', 'thoth-init', 'SKILL.md'), {
        recursive: true,
      });
    }
    if (kind === 'malformed') {
      mkdirSync(join(root, 'skills', 'thoth-init'), { recursive: true });
      writeFileSync(
        join(root, 'skills', 'thoth-init', 'SKILL.md'),
        '---\nname: thoth-init\n---\nbody',
      );
    }
    await expect(
      registerSkills(
        { skill: { transform } } as unknown as Plugin.Context,
        { packageRoot: root } as OpenCodeDependencies,
      ),
    ).rejects.toThrow(
      `bundled skill ${join(root, 'skills', 'thoth-init', 'SKILL.md')}`,
    );
    expect(transform).not.toHaveBeenCalled();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
