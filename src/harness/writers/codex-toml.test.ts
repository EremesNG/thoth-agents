import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import { renderCodexToml } from './codex-toml';

function codexFixture(name: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'src/harness/__fixtures__/codex', name),
    'utf8',
  );
}

describe('Codex TOML writer', () => {
  test('renders canonical agent TOML with multiline instructions and skips runtime-only fields', () => {
    const result = renderCodexToml({
      surfaceId: 'project-agent-toml',
      values: {
        sandbox_mode: 'workspace-write',
        developer_instructions: 'Use "quotes"\nand Windows path C:\\tmp\\x',
        name: 'deep',
        description: 'Thorough implementation agent',
        model: 'gpt-5.4',
        model_reasoning_effort: 'high',
        mcp_servers: ['thoth_mem', 'context7'],
        'skills.config': { enabled: true, sources: ['repo'] },
        hooks: { Stop: ['speculative'] },
      },
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'codex.toml.field.unvalidated',
        surface: 'project-agent-toml',
      }),
      expect.objectContaining({
        severity: 'warning',
        code: 'codex.toml.field.unvalidated',
        surface: 'project-agent-toml',
      }),
      expect.objectContaining({
        severity: 'warning',
        code: 'codex.toml.field.unvalidated',
        surface: 'project-agent-toml',
      }),
    ]);
    expect(result.content).toBe(
      [
        'name = "deep"',
        'description = "Thorough implementation agent"',
        'developer_instructions = """',
        'Use "quotes"',
        'and Windows path C:\\\\tmp\\\\x',
        '"""',
        '',
        'model = "gpt-5.4"',
        'model_reasoning_effort = "high"',
        'sandbox_mode = "workspace-write"',
        '',
      ].join('\n'),
    );
    expect(result.content).not.toContain('mcp_servers');
    expect(result.content).not.toContain('skills.config');
    expect(result.content).not.toContain('hooks =');
    expect(result.content).not.toContain('[hooks');
  });

  test('rejects unknown or unvalidated fields without rendering them', () => {
    const result = renderCodexToml({
      surfaceId: 'project-config-toml',
      values: {
        model: 'gpt-5.4',
        hooks: { Stop: ['speculative'] },
      },
    });

    expect(result.content).toBe('model = "gpt-5.4"\n');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'codex.toml.field.unvalidated',
        surface: 'project-config-toml',
      }),
    ]);
  });

  test('diagnoses unregistered surfaces and emits no content', () => {
    const result = renderCodexToml({
      surfaceId: 'not-real',
      values: { model: 'gpt-5.4' },
    });

    expect(result.content).toBe('');
    expect(result.diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'harness.surface_unvalidated',
      fallback: 'diagnostic-only',
    });
  });

  test('matches deterministic Codex config and MCP TOML fixtures', () => {
    const config = renderCodexToml({
      surfaceId: 'project-config-toml',
      values: {
        approval_policy: 'on-request',
        sandbox_mode: 'workspace-write',
        'skills.config': { enabled: true, sources: ['repo'] },
        agents: [
          'orchestrator',
          'explorer',
          'librarian',
          'oracle',
          'designer',
          'quick',
          'deep',
        ],
      },
    });
    const mcp = renderCodexToml({
      surfaceId: 'mcp-server-config',
      values: {
        mcp_servers: {
          context7: {
            url: 'https://mcp.context7.com/mcp',
          },
          thoth_mem: {
            command: 'pnpm',
            args: ['dlx', 'thoth-mem@latest'],
          },
        },
      },
    });

    expect(config.diagnostics).toEqual([]);
    expect(mcp.diagnostics).toEqual([]);
    expect(config.content).toBe(codexFixture('config.toml'));
    expect(mcp.content).not.toContain('[mcp_servers.thoth_mem]');
    expect(mcp.content).toContain('[mcp_servers.context7]');
    expect(mcp.content).toBe(codexFixture('mcp.toml'));
  });

  test('warns and skips reasoning effort for surfaces without validated support', () => {
    const result = renderCodexToml({
      surfaceId: 'mcp-server-config',
      values: {
        model_reasoning_effort: 'high',
        mcp_servers: {
          thoth_mem: {
            command: 'pnpm',
          },
        },
      },
    });

    expect(result.content).not.toContain('model_reasoning_effort');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'codex.toml.field.unvalidated',
        surface: 'mcp-server-config',
      }),
    ]);
  });
});
