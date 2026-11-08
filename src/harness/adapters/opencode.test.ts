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
    expect(root).toMatch(
      /Root: specialists default to unlocated-source discovery, external research and substantive implementation; you direct\/decide\/accept\/synthesize/i,
    );
    expect(block.indexOf('Unlocated local source')).toBeLessThan(
      block.indexOf(
        'Direct-work exceptions: known low-risk mechanical work (reviewed commits included)',
      ),
    );
    expect
      .soft(block)
      .toContain(
        'Unlocated local source/flow/responsibility: Explorer before root read/search/shell/git/CodeGraph',
      );
    expect.soft(block).toContain('assign unknown location, no pre-read');
    expect
      .soft(block)
      .toContain('Navigation/fallbacks govern investigators, not root.');
    expect
      .soft(block)
      .toContain(
        'Before first read/search/shell each turn: bounded known-source direct-work exception or dispatch',
      );
    expect.soft(block).toContain('Prompt guidance, not runtime enforcement.');
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

    expect(root).toContain('Root:');
    expect(root).toContain('.thoth/changes/<id>/<id>.md');
    expect(root).toContain('Bundled `thoth-sdd` skill');
    expect(root).toContain(
      'fresh read-only subagent agent:"oracle" for substantial/material risk',
    );
    expect(root).toContain(
      'focused root checks for trivial deterministic low-risk work',
    );
    expect(root).not.toMatch(/@sdd-(?:specify|plan|tasks)/);
    expect(root).toContain('`subagent`');
    expect(root).not.toMatch(/task_status|task_id|subagent_type|@oracle/);
    expect(root).toContain('`question`');
    expect(root).not.toContain('collaboration.spawn_agent');
    expect(root).not.toContain('requirements-interview');

    expect(oracle).toContain('matching bundled thoth-sdd guidance');
    expect(oracle).toContain('Reject self-review');
    expect(oracle).toContain('Do not mutate the workspace');
  });

  test('renders OpenCode-native fresh and continuation lifecycle guidance', () => {
    const root = renderOpenCodeAgentConfigs().orchestrator.prompt ?? '';

    expect(root).toContain('agent, description, prompt; omit sessionID');
    expect(root).toContain(
      'Use sessionID only to continue/clarify the same assignment, including while running',
    );
    expect(root).toContain('background:true');
    expect(root).toContain('No status polling tool exists');
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
