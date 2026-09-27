import { describe, expect, test } from 'vitest';
import { getAgentConfigs } from '../../agents';
import { type PluginConfig, SUBAGENT_NAMES } from '../../config';
import { opencodeAdapter, renderOpenCodeAgentConfigs } from './opencode';

describe('OpenCode harness adapter v0.3', () => {
  test('renders the canonical six-role roster without adaptation drift', () => {
    const rendered = renderOpenCodeAgentConfigs();

    expect(Object.keys(rendered)).toEqual(['orchestrator', ...SUBAGENT_NAMES]);
    expect(rendered).toEqual(getAgentConfigs());
  });

  test('preserves canonical overrides for the focused specialist roster', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { model: 'test/orchestrator', temperature: 0.2 },
        worker: { model: 'test/worker', steps: 12 },
      },
    };
    const rendered = renderOpenCodeAgentConfigs(config);

    expect(rendered).toEqual(getAgentConfigs(config));
    expect(rendered.orchestrator.mode).toBe('primary');
    expect(rendered.worker.mode).toBe('subagent');
    expect(rendered.worker.model).toBe('test/worker');
  });

  test('keeps adaptive routing and independent review in native wording', () => {
    const configs = renderOpenCodeAgentConfigs();
    const root = configs.orchestrator.prompt ?? '';
    const oracle = configs.oracle.prompt ?? '';

    expect(root).toContain('adaptive root');
    expect(root).toContain('.thoth/changes/<id>/work.yaml');
    expect(root).toContain('bundled `thoth-work` skill');
    expect(root).toContain(
      'Use a fresh @oracle for persisted work and materially risky direct work',
    );
    expect(root).toContain(
      'focused root checks suffice only for trivial deterministic work',
    );
    expect(root).not.toMatch(/@sdd-(?:specify|plan|tasks)/);
    expect(root).toContain('`task`');
    expect(root).toContain('`question`');
    expect(root).not.toContain('collaboration.spawn_agent');
    expect(root).not.toContain('requirements-interview');

    expect(oracle).toContain('matching bundled thoth-work guidance');
    expect(oracle).toContain('Reject self-review');
    expect(oracle).toContain('Do not mutate the workspace');
  });

  test('renders OpenCode-native fresh and continuation lifecycle guidance', () => {
    const root = renderOpenCodeAgentConfigs().orchestrator.prompt ?? '';

    expect(root).toContain('`task` without `task_id`');
    expect(root).toContain('`task` with the prior `task_id`');
    expect(root).toContain(
      'omitting `task_id` creates an isolated child session',
    );
    expect(root).not.toContain('collaboration.followup_task');
    expect(root).not.toContain('SendMessage');
    expect(root).not.toContain('fork_turns');
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
