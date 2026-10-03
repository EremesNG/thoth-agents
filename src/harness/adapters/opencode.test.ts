import { describe, expect, test } from 'vitest';
import { getAgentConfigs } from '../../agents';
import { type PluginConfig, SUBAGENT_NAMES } from '../../config';
import {
  getAgentPackContract,
  getImplementationOwnershipInstructions,
} from '../core/agent-pack';
import { opencodeAdapter, renderOpenCodeAgentConfigs } from './opencode';

describe('OpenCode harness adapter v0.3', () => {
  test('renders canonical default-first ownership with discovery navigation and a pre-tool check', () => {
    const root = String(
      renderOpenCodeAgentConfigs().orchestrator?.prompt ?? '',
    );
    const ownership =
      getAgentPackContract().orchestrationPolicy.implementationOwnership;
    const block =
      root.match(
        /<implementation-ownership>\n([\s\S]*?)\n<\/implementation-ownership>/,
      )?.[1] ?? '';
    expect(block).toBe(
      getImplementationOwnershipInstructions(ownership)
        .map((instruction) => `- ${instruction}`)
        .join('\n'),
    );
    const defaultIndex = block.indexOf('Specialists execute by default');
    expect(defaultIndex).toBeGreaterThanOrEqual(0);
    expect(
      block.indexOf(
        'Root retains known low-risk mechanical work, including reviewed commits',
      ),
    ).toBeGreaterThan(defaultIndex);
    expect
      .soft(block)
      .toMatch(
        /unlocated local source, flow, or responsibility.*Explorer.*before any root code search, file read, shell\/git inspection, or CodeGraph query/i,
      );
    expect
      .soft(block)
      .toContain(
        'no preliminary discovery is needed to prepare that assignment',
      );
    expect
      .soft(block)
      .toContain(
        'Project navigation instructions (webstorm-index, CodeGraph, rg, docs routers) govern how the assigned investigator searches; they never make root the investigator.',
      );
    expect
      .soft(block)
      .toMatch(
        /before the first read\/search\/shell call of a turn, root checks.*known bounded source within a direct-work exception.*if not, dispatch/i,
      );
    expect
      .soft(block)
      .toContain('This self-check is guidance, not runtime enforcement.');
    for (const phrase of [
      'If delegating',
      'Boundaries alone do not require delegation',
      'net gain',
      'Otherwise specialists',
    ]) {
      expect.soft(root).not.toContain(phrase);
    }
  });
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

  test('keeps proportional classification and independent review in native wording', () => {
    const configs = renderOpenCodeAgentConfigs();
    const root = configs.orchestrator.prompt ?? '';
    const oracle = configs.oracle.prompt ?? '';

    expect(root).toContain('root coordinator');
    expect(root).toContain('.thoth/changes/<id>/<id>.md');
    expect(root).toContain('bundled `thoth-sdd` skill');
    expect(root).toContain(
      'substantial or materially risky work requires fresh read-only @oracle judgment',
    );
    expect(root).toContain(
      'Trivial deterministic low-risk work may use focused root checks',
    );
    expect(root).not.toMatch(/@sdd-(?:specify|plan|tasks)/);
    expect(root).toContain('`task`');
    expect(root).toContain('`question`');
    expect(root).not.toContain('collaboration.spawn_agent');
    expect(root).not.toContain('requirements-interview');

    expect(oracle).toContain('matching bundled thoth-sdd guidance');
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
