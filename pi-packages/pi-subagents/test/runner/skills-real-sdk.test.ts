import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DefaultPackageManager,
  ModelRuntime,
  ProjectTrustStore,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { afterEach, expect, it, vi } from 'vitest';
import { sdkSubagentRunner } from '../../src/runner/sdk-runner.js';
import { fixtureProvider } from './fixtures/provider-fixture.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([
  { label: 'trusted parent', trusted: true, project: true },
  {
    label: 'trusted descendant using session cwd',
    trusted: true,
    nested: true,
    project: true,
  },
  { label: 'bash catalog', trusted: true, tool: 'bash', project: true },
  {
    label: 'missing offline resolver API',
    trusted: true,
    floor: true,
    project: false,
    empty: true,
  },
  {
    label: 'discovery failure degrades',
    trusted: true,
    failure: true,
    project: false,
    empty: true,
  },
  {
    label: 'untrusted parent overrides persisted trust',
    trusted: false,
    persisted: true,
    project: false,
  },
  {
    label: 'persisted outside parent',
    outside: true,
    trusted: false,
    persisted: true,
    project: true,
  },
  {
    label: 'unknown outside parent',
    outside: true,
    trusted: true,
    project: false,
  },
  {
    label: 'filter names and globs',
    trusted: true,
    skills: ['user-skill', 'package-*', 'missing'],
    project: false,
    filtered: true,
  },
  {
    label: 'empty filter',
    trusted: true,
    skills: [],
    project: false,
    empty: true,
  },
  {
    label: 'switch off',
    trusted: true,
    enabled: false,
    project: false,
    empty: true,
  },
])('offline lean catalog: $label', async ({
  trusted,
  persisted,
  outside,
  nested,
  tool = 'read',
  failure,
  floor,
  skills,
  enabled,
  project,
  filtered,
  empty,
}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-child-skills-'));
  const agentDir = path.join(root, 'agent');
  const parentCwd = path.join(root, 'parent');
  const cwd = outside
    ? path.join(root, 'other')
    : nested
      ? path.join(parentCwd, 'nested')
      : parentCwd;
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const skill = (dir: string, name: string, hidden = false) => {
    const file = path.join(dir, name, 'SKILL.md');
    write(
      file,
      `---\nname: ${name}\ndescription: Metadata for ${name}\ndisable-model-invocation: ${hidden}\n---\nSECRET_BODY_${name}`,
    );
    return file;
  };
  const userPath = skill(path.join(agentDir, 'skills'), 'user-skill');
  skill(path.join(cwd, '.pi', 'skills'), 'project-skill');
  skill(path.join(root, '.agents', 'skills'), 'ancestor-skill');
  skill(path.join(agentDir, 'skills'), 'hidden-skill', true);
  const packageDir = path.join(root, 'package');
  skill(path.join(packageDir, 'skills'), 'package-review');
  write(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name: 'thoth-agents', pi: { skills: ['./skills'] } }),
  );
  write(
    path.join(agentDir, 'settings.json'),
    JSON.stringify({
      packages: [packageDir, 'npm:pi-child-catalog-missing@0.0.0'],
    }),
  );
  write(path.join(cwd, 'AGENTS.md'), 'CONTEXT_SENTINEL');
  write(path.join(cwd, '.pi', 'SYSTEM.md'), 'ROOT_SENTINEL');
  write(path.join(cwd, '.pi', 'APPEND_SYSTEM.md'), 'APPEND_SENTINEL');
  write(path.join(cwd, '.pi', 'prompts', 'template.md'), 'TEMPLATE_SENTINEL');
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  vi.stubEnv('PI_SUBAGENTS_HISTORY_HOME', path.join(root, 'history'));
  if (persisted !== undefined)
    new ProjectTrustStore(agentDir).set(cwd, persisted);
  const parent = SettingsManager.create(parentCwd, agentDir, {
    projectTrusted: trusted,
  });
  const before = parent.getSettings();
  const mutate = vi.spyOn(parent, 'setProjectTrusted');
  const resolve = vi.spyOn(DefaultPackageManager.prototype, 'resolve');
  if (floor) Object.defineProperty(resolve, 'length', { value: 0 });
  if (failure)
    resolve.mockRejectedValueOnce(new Error('fixture discovery failure'));
  const install = vi
    .spyOn(DefaultPackageManager.prototype as any, 'installParsedSource')
    .mockRejectedValue(new Error('Install forbidden'));
  const runtime = await ModelRuntime.create({
    modelsPath: null,
    authPath: path.join(agentDir, 'auth.json'),
    allowModelNetwork: false,
  });
  let sentPrompt = '';
  runtime.registerProvider('catalog-fixture', {
    ...fixtureProvider('done'),
    streamSimple(model, context, options) {
      sentPrompt = JSON.stringify(context.messages);
      return fixtureProvider('done').streamSimple!(model, context, options);
    },
  });
  await runtime.refresh({ allowNetwork: false });
  const activities: any[] = [];
  try {
    const result = await sdkSubagentRunner({
      definition: {
        name: 'specialist',
        description: 'test',
        filePath: '',
        instructions: 'SPECIALIST_SENTINEL',
        tools: [tool],
        skills,
        model: { provider: 'catalog-fixture', id: 'fixture' },
      },
      task: 'Reply done',
      cwd,
      ctx: {
        cwd,
        sessionManager: { getCwd: () => parentCwd },
        settingsManager: parent,
        isProjectTrusted: () => trusted,
        modelRuntime: runtime,
      },
      config: {
        default_tools: ['read'],
        timeout_ms: 10000,
        stall_timeout_ms: 10000,
        max_concurrency: 1,
        session_resources: 'lean',
        lean_skills: enabled,
        enable_ask_orchestrator: false,
      },
      signal: new AbortController().signal,
      onActivity: (activity) => activities.push(activity),
    });
    const prompt = result.system_prompt!;
    expect(prompt).toContain('SPECIALIST_SENTINEL');
    expect(sentPrompt).toContain('SPECIALIST_SENTINEL');
    for (const sentinel of [
      'SECRET_BODY',
      'hidden-skill',
      'CONTEXT_SENTINEL',
      'ROOT_SENTINEL',
      'APPEND_SENTINEL',
      'TEMPLATE_SENTINEL',
    ])
      expect(prompt).not.toContain(sentinel);
    expect(prompt.includes('project-skill')).toBe(project);
    expect(prompt.includes('ancestor-skill')).toBe(project);
    expect(prompt.includes('user-skill')).toBe(!empty);
    expect(prompt.includes('package-review')).toBe(!empty);
    if (!empty) {
      expect(prompt).toContain('Metadata for user-skill');
      expect(prompt.replaceAll('\\', '/')).toContain(
        userPath.replaceAll('\\', '/'),
      );
      expect(sentPrompt).toContain('user-skill');
    }
    if (filtered) {
      expect(
        [...activities].reverse().find((activity) => activity.transcript)
          ?.transcript,
      ).toContain('Skill filter matched no visible skill: missing');
      expect(activities).toContainEqual(
        expect.objectContaining({
          diagnostic: true,
          message: expect.stringContaining('missing'),
        }),
      );
    }
    if (!floor) expect(resolve.mock.calls[0][0]).toBeTypeOf('function');
    // Discovery is allowed configured sources; every loader reload must be sanitized.
    for (
      let index = floor ? 0 : 1;
      index < resolve.mock.calls.length;
      index++
    ) {
      expect(resolve.mock.calls[index][0]).toBeUndefined();
      expect(
        (resolve.mock.contexts[index] as any).settingsManager.getPackages(),
      ).toEqual([]);
    }
    expect(install).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
    expect(parent.isProjectTrusted()).toBe(trusted);
    expect(parent.getSettings()).toEqual(before);
    expect(activities).toContainEqual(
      expect.objectContaining({
        diagnostic: true,
        message: expect.stringContaining(
          floor
            ? 'skip-handler API'
            : failure
              ? 'fixture discovery failure'
              : 'pi-child-catalog-missing',
        ),
      }),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
