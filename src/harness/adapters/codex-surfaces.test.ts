import { describe, expect, test } from 'vitest';
import {
  assertCodexSurfaceCanGenerate,
  CODEX_SURFACES,
  getValidatedCodexArtifactTargets,
  validateCodexHookSurface,
  validateCodexPluginPackageSurface,
} from './codex-surfaces';

describe('Codex surface validation', () => {
  test('records validated, unsupported, and unknown surfaces', () => {
    expect(CODEX_SURFACES.map((surface) => surface.status)).toEqual(
      expect.arrayContaining(['validated', 'unsupported', 'unknown']),
    );
  });

  test('exposes only validated surfaces as artifact targets', () => {
    expect(
      getValidatedCodexArtifactTargets().map((surface) => surface.id),
    ).toEqual([
      'project-agent-toml',
      'project-config-toml',
      'mcp-server-config',
      'repo-skills-directory',
      'project-hooks-json',
      'inline-hooks-table',
      'features-hooks-toggle',
      'plugin-hooks-bundle',
      'plugin-manifest-json',
      'plugin-skills-directory',
      'plugin-hooks-json',
      'plugin-mcp-json',
    ]);
  });

  test('records validated plugin package manifest, skills, and hook bundle surfaces', () => {
    expect(
      CODEX_SURFACES.filter((surface) =>
        surface.path?.startsWith('.codex-plugin'),
      ).map((surface) => ({
        id: surface.id,
        status: surface.status,
        path: surface.path,
        fields: surface.fields,
      })),
    ).toEqual([
      {
        id: 'plugin-manifest-json',
        status: 'validated',
        path: '.codex-plugin/plugin.json',
        fields: [
          'name',
          'version',
          'description',
          'skills',
          'mcpServers',
          'apps',
          'hooks',
          'interface',
        ],
      },
      {
        id: 'plugin-skills-directory',
        status: 'validated',
        path: '.codex-plugin/skills/{skill}/SKILL.md',
        fields: ['skills', './skills/'],
      },
      {
        id: 'plugin-hooks-json',
        status: 'validated',
        path: '.codex-plugin/hooks/hooks.json',
        fields: ['hooks', './hooks/hooks.json'],
      },
      {
        id: 'plugin-mcp-json',
        status: 'validated',
        path: '.codex-plugin/codex.mcp.json',
        fields: ['mcpServers', './codex.mcp.json'],
      },
    ]);
  });

  test('preserves stable Codex plugin surface identity for generated packages', () => {
    expect(
      getValidatedCodexArtifactTargets()
        .filter((surface) => surface.path?.startsWith('.codex-plugin'))
        .map((surface) => ({
          id: surface.id,
          target: surface.target,
          artifactKind: surface.artifactKind,
          path: surface.path,
        })),
    ).toEqual([
      {
        id: 'plugin-manifest-json',
        target: 'plugin-manifest',
        artifactKind: 'manifest',
        path: '.codex-plugin/plugin.json',
      },
      {
        id: 'plugin-skills-directory',
        target: 'skill-directory',
        artifactKind: 'skill',
        path: '.codex-plugin/skills/{skill}/SKILL.md',
      },
      {
        id: 'plugin-hooks-json',
        target: 'hook-config',
        artifactKind: 'hook-config',
        path: '.codex-plugin/hooks/hooks.json',
      },
      {
        id: 'plugin-mcp-json',
        target: 'mcp-config',
        artifactKind: 'mcp-config',
        path: '.codex-plugin/codex.mcp.json',
      },
    ]);
  });

  test('fails closed on unvalidated plugin package paths and manifest fields', () => {
    expect(
      validateCodexPluginPackageSurface({
        surfaceId: 'plugin-manifest-json',
        path: '.codex-plugin/plugin.json',
        fields: ['name', 'x-dangerous-field'],
      }),
    ).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: 'codex.plugin.field.unvalidated' }),
      ],
    });

    expect(
      validateCodexPluginPackageSurface({
        surfaceId: 'plugin-skills-directory',
        path: '.agents/skills/example-skill/SKILL.md',
        fields: ['skills'],
      }),
    ).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: 'codex.plugin.path.unvalidated' }),
      ],
    });

    expect(
      validateCodexPluginPackageSurface({
        surfaceId: 'plugin-hooks-json',
        path: '.codex-plugin/../hooks/hooks.json',
        fields: ['hooks'],
      }),
    ).toMatchObject({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: 'codex.plugin.path.unvalidated' }),
      ],
    });
  });

  test('records documented hook config surfaces without changing runtime hook capability', () => {
    expect(
      CODEX_SURFACES.filter((surface) => surface.target === 'hook-config').map(
        (surface) => ({
          id: surface.id,
          status: surface.status,
          path: surface.path,
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        {
          id: 'project-hooks-json',
          status: 'validated',
          path: '.codex/hooks.json',
        },
        {
          id: 'inline-hooks-table',
          status: 'validated',
          path: '.codex/config.toml',
        },
        {
          id: 'features-hooks-toggle',
          status: 'validated',
          path: '.codex/config.toml',
        },
        {
          id: 'plugin-hooks-bundle',
          status: 'validated',
          path: '.codex/plugins/{plugin}/hooks.json',
        },
      ]),
    );
  });

  test('allows generation for validated agent TOML only after validation', () => {
    const result = assertCodexSurfaceCanGenerate('project-agent-toml');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.surface.path).toBe('.codex/agents/{name}.toml');
      expect(result.surface.fields).toContain('developer_instructions');
    }
  });

  test('blocks unsupported permission controls with an enforcement diagnostic', () => {
    const result = assertCodexSurfaceCanGenerate(
      'per-agent-runtime-permissions',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostic).toMatchObject({
        severity: 'warning',
        code: 'codex.permission.memory.enforcement_gap',
        fallback: 'instruction-only',
      });
    }
  });

  test('records the current collaboration surface as supported generic delegation', () => {
    const surface = CODEX_SURFACES.find(
      (candidate) => candidate.id === 'programmatic-delegation-runtime',
    );

    expect(surface).toMatchObject({
      status: 'validated',
      fields: expect.arrayContaining([
        'collaboration.spawn_agent',
        'collaboration.wait_agent',
        'collaboration.list_agents',
        'collaboration.send_message',
        'collaboration.followup_task',
        'collaboration.interrupt_agent',
      ]),
    });
    expect(surface?.summary).toContain('generic programmatic delegation');
    expect(surface?.evidence).toContain('task_name');
    expect(surface?.fields).not.toEqual(
      expect.arrayContaining([
        'named installed-role selection',
        'per-role permission enforcement',
        'automatic subagent session close',
      ]),
    );
  });

  test('keeps named role selection and per-role enforcement instruction-only', () => {
    const surface = CODEX_SURFACES.find(
      (candidate) => candidate.id === 'per-agent-runtime-permissions',
    );

    expect(surface).toMatchObject({
      status: 'unsupported',
      fallback: 'instruction-only',
    });
    expect(surface?.summary.toLowerCase()).toContain('agent_type when exposed');
    expect(surface?.summary.toLowerCase()).toContain('role-prefixed fallback');
    expect(surface?.summary.toLowerCase()).toContain(
      'per-role permission enforcement',
    );
  });

  test('blocks unknown or missing surfaces as diagnostic-only', () => {
    for (const id of ['inline-hooks', 'not-registered']) {
      const result = assertCodexSurfaceCanGenerate(id);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostic.fallback).toBe('diagnostic-only');
      }
    }
  });

  test('validates documented Codex hook events with command handlers', () => {
    for (const event of [
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PermissionRequest',
      'PostToolUse',
      'Stop',
    ]) {
      expect(
        validateCodexHookSurface({
          event,
          handler: { type: 'command', command: 'bun run hook' },
        }),
      ).toMatchObject({ ok: true, event, handlerType: 'command' });
    }
  });

  test('diagnoses unsupported Codex hook events and handler shapes', () => {
    const cases = [
      {
        input: { event: 'PreCompact', handler: { type: 'command' } },
        code: 'codex.hooks.event.unsupported',
      },
      {
        input: { event: 'Stop', handler: { type: 'prompt' } },
        code: 'codex.hooks.handler.prompt_unsupported',
      },
      {
        input: { event: 'Stop', handler: { type: 'agent' } },
        code: 'codex.hooks.handler.agent_unsupported',
      },
      {
        input: { event: 'Stop', handler: { type: 'command', async: true } },
        code: 'codex.hooks.async.unsupported',
      },
      {
        input: {
          event: 'Stop',
          handler: { type: 'command' },
          outputFields: ['block'],
        },
        code: 'codex.hooks.output_field.unsupported',
      },
      {
        input: {
          event: 'PreToolUse',
          handler: { type: 'command' },
          interceptsToolExecution: true,
        },
        code: 'codex.hooks.tool_interception.unsupported',
      },
    ] as const;

    for (const { input, code } of cases) {
      const result = validateCodexHookSurface(input);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics).toEqual(
          expect.arrayContaining([expect.objectContaining({ code })]),
        );
      }
    }
  });
});
