import { describe, expect, test } from 'vitest';
import { getAgentConfigs } from '../../agents';
import { type PluginConfig, SUBAGENT_NAMES } from '../../config';
import { opencodeAdapter, renderOpenCodeAgentConfigs } from './opencode';

describe('OpenCode harness adapter v0.3', () => {
  test('renders the canonical ten-role roster without adaptation drift', () => {
    const rendered = renderOpenCodeAgentConfigs();

    expect(Object.keys(rendered)).toEqual(['orchestrator', ...SUBAGENT_NAMES]);
    expect(rendered).toEqual(getAgentConfigs());
  });

  test('preserves canonical overrides including SDD phase agents', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { model: 'test/orchestrator', temperature: 0.2 },
        'sdd-plan': { model: 'test/planner', steps: 12 },
        quick: {
          permission: { read: 'allow', edit: 'deny' },
        },
      },
    };
    const rendered = renderOpenCodeAgentConfigs(config);

    expect(rendered).toEqual(getAgentConfigs(config));
    expect(rendered.orchestrator.mode).toBe('primary');
    expect(rendered['sdd-plan'].mode).toBe('subagent');
    expect(rendered['sdd-plan'].model).toBe('test/planner');
    expect(rendered.quick.permission).toEqual({
      read: 'allow',
      edit: 'deny',
    });
  });

  test('keeps adaptive routing and coordination boundaries in native wording', () => {
    const configs = renderOpenCodeAgentConfigs();
    const root = configs.orchestrator.prompt ?? '';
    const specify = configs['sdd-specify'].prompt ?? '';

    expect(root).toContain('adaptive root');
    expect(root).toContain('Accelerated SDD');
    expect(root).toContain('@sdd-specify');
    expect(root).toContain('`task`');
    expect(root).toContain('`question`');
    expect(root).not.toContain('collaboration.spawn_agent');
    expect(root).not.toContain('requirements-interview');

    expect(specify).toContain('coordination-write');
    expect(specify).toContain('openspec/');
    expect(specify).toContain('Do not edit product code');
  });

  test('reports the first-class OpenCode capability surface', () => {
    expect(opencodeAdapter.id).toBe('opencode');
    expect(opencodeAdapter.capabilities).toMatchObject({
      agentDefinitions: 'supported',
      delegatedExecution: 'supported',
      parallelDelegation: 'supported',
      rolePermissions: 'supported',
    });

    const result = opencodeAdapter.render({ projectRoot: process.cwd() });
    expect(result.harness).toBe('opencode');
    expect(result.diagnostics).toEqual([]);
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        harness: 'opencode',
        kind: 'agent-config',
        path: 'opencode.agent.config.json',
      }),
    ]);
  });

  test('does not embed provider-owned memory protocol', () => {
    const content = String(
      opencodeAdapter.render({ projectRoot: process.cwd() }).artifacts[0]
        ?.content,
    );

    expect(content).toContain('installed provider guidance');
    expect(content).not.toMatch(
      /mem_(?:save|recall|get|context|project|session)\s*\(/,
    );
    expect(content).not.toContain('sdd/{change}/{artifact}');
  });
});
