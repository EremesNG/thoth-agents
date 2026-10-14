import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DefaultPackageManager,
  ProjectTrustStore,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it } from 'vitest';
import { leanResources } from '../../src/runner/lean-resources.js';

const sdk = { DefaultPackageManager, ProjectTrustStore, SettingsManager };
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-canonical-trust-'));
  roots.push(root);
  const parent = path.join(root, 'parent');
  const outside = path.join(root, 'outside');
  const agentDir = path.join(root, 'agent');
  for (const dir of [parent, outside, agentDir]) fs.mkdirSync(dir);
  const write = (cwd: string, relative: string, content: string) => {
    const file = path.join(cwd, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  const resources = (cwd: string) => ({
    skill: write(
      cwd,
      '.pi/skills/outside-skill/SKILL.md',
      '---\nname: outside-skill\ndescription: Outside project skill\n---\nbody',
    ),
    extension: write(
      cwd,
      '.pi/extensions/outside.ts',
      'export default () => {};',
    ),
  });
  const diagnostics: string[] = [];
  const discover = (cwd: string, parentCwd = parent) =>
    leanResources(
      sdk,
      cwd,
      agentDir,
      {
        sessionManager: { getCwd: () => parentCwd },
        isProjectTrusted: () => true,
      },
      true,
      undefined,
      (message) => diagnostics.push(message),
    );
  return { parent, outside, agentDir, resources, discover, diagnostics };
}

for (const persisted of [false, undefined]) {
  it(`outside junction cannot inherit parent trust (persisted: ${persisted})`, async (context) => {
    const f = fixture();
    const resources = f.resources(f.outside);
    const link = path.join(f.parent, 'linked-project');
    try {
      fs.symlinkSync(
        f.outside,
        link,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(code ?? '')) {
        context.skip(`Platform forbids directory links: ${String(error)}`);
        return;
      }
      throw error;
    }
    if (persisted !== undefined)
      new ProjectTrustStore(f.agentDir).set(f.outside, persisted);
    const result = await f.discover(link);
    expect(result.settingsManager.isProjectTrusted()).toBe(false);
    expect(result.loaderSettings.isProjectTrusted()).toBe(false);
    expect(result.additionalSkillPaths).not.toContain(resources.skill);
    expect(
      result.additionalSkillPaths.some((file) =>
        file.includes('outside-skill'),
      ),
    ).toBe(false);
    expect(result.additionalExtensionPaths).not.toContain(resources.extension);
    expect(
      result.additionalExtensionPaths.some((file) =>
        file.includes('outside.ts'),
      ),
    ).toBe(false);
    expect(f.diagnostics.join('\n')).toMatch(/outside.*parent|containment/i);
  });
}

it('genuine subdirectory inherits parent trust for skills and extensions', async () => {
  const f = fixture();
  const cwd = path.join(f.parent, 'nested');
  const resources = f.resources(cwd);
  new ProjectTrustStore(f.agentDir).set(cwd, false);
  // Windows filesystem paths may differ only by casing at the two entrypoints.
  const parentCwd =
    process.platform === 'win32' ? f.parent.toUpperCase() : f.parent;
  const result = await f.discover(cwd, parentCwd);
  expect(result.settingsManager.isProjectTrusted()).toBe(true);
  expect(result.loaderSettings.isProjectTrusted()).toBe(true);
  expect(result.additionalSkillPaths).toContain(resources.skill);
  expect(result.additionalExtensionPaths).toContain(resources.extension);
  expect(f.diagnostics).toEqual([]);
});

it.each([
  'parent',
  'child',
])('realpath failure for %s does not inherit trust', async (missing) => {
  const f = fixture();
  const cwd = path.join(f.parent, 'nested');
  const parentCwd =
    missing === 'parent' ? path.join(f.parent, 'missing') : f.parent;
  if (missing === 'parent') f.resources(cwd);
  const result = await f.discover(cwd, parentCwd);
  expect(result.settingsManager.isProjectTrusted()).toBe(false);
  expect(result.loaderSettings.isProjectTrusted()).toBe(false);
  expect(
    result.additionalSkillPaths.some((file) => file.includes('outside-skill')),
  ).toBe(false);
  expect(
    result.additionalExtensionPaths.some((file) => file.includes('outside.ts')),
  ).toBe(false);
  expect(f.diagnostics.join('\n')).toMatch(
    /canonical.*containment unavailable/i,
  );
});
