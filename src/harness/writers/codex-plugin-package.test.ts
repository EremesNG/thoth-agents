import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderCodexPluginPackage } from './codex-plugin-package';

const fixtureRoot = path.join(process.cwd(), 'src/harness/__fixtures__/codex');

describe('Codex plugin package writer', () => {
  test('renders deterministic plugin.json with official fields and plugin-root assets', () => {
    const result = renderCodexPluginPackage({
      manifest: {
        version: '1.2.3',
        name: 'thoth-agents',
        description: 'Delegate-first OpenCode agents for Codex.',
        extra: 'must be skipped',
      },
      assets: [
        {
          surfaceId: 'plugin-skills-directory',
          manifestField: 'skills',
          path: '.codex-plugin/skills/',
        },
        {
          surfaceId: 'plugin-hooks-json',
          manifestField: 'hooks',
          path: '.codex-plugin/hooks/hooks.json',
          hookDefinitions: [
            {
              event: 'SessionStart',
              handler: { type: 'command', command: 'bun run hook' },
            },
          ],
        },
        {
          surfaceId: 'plugin-mcp-json',
          manifestField: 'mcpServers',
          path: '.codex-plugin/.mcp.json',
          content:
            '{\n  "mcp_servers": {\n    "thoth_mem": {\n      "command": "bun",\n      "args": [\n        "x",\n        "thoth-mem"\n      ]\n    }\n  }\n}\n',
        },
      ],
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'codex.plugin.field.unvalidated' }),
    ]);
    expect(result.artifacts.map((artifact) => artifact.path)).toEqual([
      '.codex-plugin/.mcp.json',
      '.codex-plugin/hooks/hooks.json',
      '.codex-plugin/plugin.json',
      '.codex-plugin/.thoth-agents-plugin-assets.json',
    ]);
    expect(String(result.artifacts[2].content)).toBe(
      '{\n' +
        '  "name": "thoth-agents",\n' +
        '  "version": "1.2.3",\n' +
        '  "description": "Delegate-first OpenCode agents for Codex.",\n' +
        '  "skills": "./skills/",\n' +
        '  "mcpServers": "./.mcp.json",\n' +
        '  "hooks": "./hooks/hooks.json"\n' +
        '}\n',
    );
  });

  test('returns fail-closed diagnostics for unvalidated assets and outside paths', () => {
    const result = renderCodexPluginPackage({
      manifest: { name: 'pkg', version: '0.0.0' },
      assets: [
        {
          surfaceId: 'repo-skills-directory',
          manifestField: 'skills',
          path: '.agents/skills/',
        },
        {
          surfaceId: 'plugin-hooks-json',
          manifestField: 'hooks',
          path: '../hooks/hooks.json',
          content: '{}\n',
        },
        {
          surfaceId: 'plugin-mcp-json',
          manifestField: 'mcpServers',
          path: '../.mcp.json',
          content: '{}\n',
        },
      ],
    });

    expect(result.artifacts.map((artifact) => artifact.path)).toEqual([
      '.codex-plugin/plugin.json',
      '.codex-plugin/.thoth-agents-plugin-assets.json',
    ]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'codex.plugin.surface.unvalidated' }),
        expect.objectContaining({ code: 'codex.plugin.path.unvalidated' }),
      ]),
    );
    expect(String(result.artifacts[0].content)).not.toContain('skills');
    expect(String(result.artifacts[0].content)).not.toContain('hooks');
    expect(String(result.artifacts[0].content)).not.toContain('mcpServers');
  });

  test('bundles only hook definitions that pass existing Codex hook validation', () => {
    const result = renderCodexPluginPackage({
      manifest: { name: 'pkg', version: '0.0.0' },
      assets: [
        {
          surfaceId: 'plugin-hooks-json',
          manifestField: 'hooks',
          path: '.codex-plugin/hooks/hooks.json',
          hookDefinitions: [
            {
              event: 'SessionStart',
              handler: { type: 'command', command: 'bun run session-start' },
            },
            {
              event: 'PreCompact',
              handler: { type: 'command', command: 'bun run compact' },
            },
            {
              event: 'Stop',
              handler: { type: 'prompt', command: 'ignored' },
            },
            {
              event: 'PreToolUse',
              handler: { type: 'command', command: 'bun run intercept' },
              interceptsToolExecution: true,
            },
            {
              event: 'PostToolUse',
              handler: {
                type: 'command',
                command: 'bun run async-hook',
                async: true,
              },
            },
            {
              event: 'PermissionRequest',
              handler: { type: 'command', command: 'bun run permission' },
              outputFields: ['block'],
            },
          ],
        },
      ],
    });

    const hookArtifact = result.artifacts.find(
      (artifact) => artifact.path === '.codex-plugin/hooks/hooks.json',
    );
    const pluginManifest = result.artifacts.find(
      (artifact) => artifact.path === '.codex-plugin/plugin.json',
    );

    expect(String(hookArtifact?.content)).toBe(
      '{\n' +
        '  "SessionStart": [\n' +
        '    {\n' +
        '      "command": "bun run session-start"\n' +
        '    }\n' +
        '  ]\n' +
        '}\n',
    );
    expect(String(pluginManifest?.content)).toContain(
      '"hooks": "./hooks/hooks.json"',
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'codex.hooks.event.unsupported' }),
        expect.objectContaining({
          code: 'codex.hooks.handler.prompt_unsupported',
        }),
        expect.objectContaining({ code: 'codex.hooks.async.unsupported' }),
        expect.objectContaining({
          code: 'codex.hooks.output_field.unsupported',
        }),
        expect.objectContaining({
          code: 'codex.hooks.tool_interception.unsupported',
        }),
      ]),
    );
  });

  test('skips plugin hook assets when every hook definition is unsupported', () => {
    const result = renderCodexPluginPackage({
      manifest: { name: 'pkg', version: '0.0.0' },
      assets: [
        {
          surfaceId: 'plugin-hooks-json',
          manifestField: 'hooks',
          path: '.codex-plugin/hooks/hooks.json',
          hookDefinitions: [
            {
              event: 'PreCompact',
              handler: { type: 'agent', command: 'ignored' },
            },
          ],
        },
      ],
    });

    expect(
      result.artifacts.some(
        (artifact) => artifact.path === '.codex-plugin/hooks/hooks.json',
      ),
    ).toBe(false);
    expect(String(result.artifacts[0].content)).not.toContain('hooks');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'codex.hooks.event.unsupported' }),
        expect.objectContaining({
          code: 'codex.hooks.handler.agent_unsupported',
        }),
        expect.objectContaining({ code: 'codex.plugin.hooks.none_packaged' }),
      ]),
    );
  });

  test('fixture output for plugin package, skill provenance, and hooks is stable', () => {
    const result = renderCodexPluginPackage({
      manifest: {
        name: 'thoth-agents',
        version: '1.0.0',
        description: 'Codex plugin package fixture.',
      },
      assets: [
        {
          surfaceId: 'plugin-skills-directory',
          manifestField: 'skills',
          path: '.codex-plugin/skills/',
          provenanceName: 'sdd-apply',
          sourcePath: 'src/skills/sdd-apply',
        },
        {
          surfaceId: 'plugin-hooks-json',
          manifestField: 'hooks',
          path: '.codex-plugin/hooks/hooks.json',
          content:
            '{\n  "SessionStart": [\n    {\n      "command": "bun run codex:session-start"\n    }\n  ]\n}\n',
        },
      ],
    });

    const byPath = new Map(
      result.artifacts.map((artifact) => [
        artifact.path,
        String(artifact.content),
      ]),
    );

    expect(byPath.get('.codex-plugin/plugin.json')).toBe(
      fs.readFileSync(path.join(fixtureRoot, 'plugin.json'), 'utf8'),
    );
    expect(byPath.get('.codex-plugin/.thoth-agents-plugin-assets.json')).toBe(
      fs.readFileSync(
        path.join(fixtureRoot, 'plugin-skill-provenance.json'),
        'utf8',
      ),
    );
    expect(byPath.get('.codex-plugin/hooks/hooks.json')).toBe(
      fs.readFileSync(path.join(fixtureRoot, 'plugin-hooks.json'), 'utf8'),
    );
  });
});
