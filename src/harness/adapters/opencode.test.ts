import { describe, expect, test } from 'vitest';
import { getAgentConfigs } from '../../agents';
import { type PluginConfig, SUBAGENT_NAMES } from '../../config';
import { opencodeAdapter, renderOpenCodeAgentConfigs } from './opencode';

describe('OpenCode harness adapter v0.3', () => {
  test('renders the canonical seven-role roster without adaptation drift', () => {
    const rendered = renderOpenCodeAgentConfigs();

    expect(Object.keys(rendered)).toEqual(['orchestrator', ...SUBAGENT_NAMES]);
    expect(rendered).toEqual(getAgentConfigs());
  });

  test('preserves canonical overrides for the focused specialist roster', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { model: 'test/orchestrator', temperature: 0.2 },
        deep: { model: 'test/deep', steps: 12 },
        quick: {
          permission: { read: 'allow', edit: 'deny' },
        },
      },
    };
    const rendered = renderOpenCodeAgentConfigs(config);

    expect(rendered).toEqual(getAgentConfigs(config));
    expect(rendered.orchestrator.mode).toBe('primary');
    expect(rendered.deep.mode).toBe('subagent');
    expect(rendered.deep.model).toBe('test/deep');
    expect(rendered.quick.permission).toEqual({
      read: 'allow',
      edit: 'deny',
    });
  });

  test('keeps adaptive routing and independent review in native wording', () => {
    const configs = renderOpenCodeAgentConfigs();
    const root = configs.orchestrator.prompt ?? '';
    const oracle = configs.oracle.prompt ?? '';

    expect(root).toContain('adaptive root');
    expect(root).toContain('Accelerated SDD');
    expect(root).toContain('bundled `thoth-sdd` skill');
    expect(root).toContain('every verify phase to @oracle');
    expect(root).not.toMatch(/@sdd-(?:specify|plan|tasks)/);
    expect(root).toContain('`task`');
    expect(root).toContain('`question`');
    expect(root).not.toContain('collaboration.spawn_agent');
    expect(root).not.toContain('requirements-interview');

    expect(oracle).toContain('matching bundled thoth-sdd reference');
    expect(oracle).toContain('Reject self-review');
    expect(oracle).toContain('Do not mutate the workspace');
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

    expect(content).toContain('installed `thoth-mem` skill');
    expect(content).toContain('do not invent provider mechanics');
    expect(content).not.toMatch(
      /mem_(?:save|recall|get|context|project|session)\s*\(/,
    );
    expect(content).not.toContain('sdd/{change}/{artifact}');
  });
});
