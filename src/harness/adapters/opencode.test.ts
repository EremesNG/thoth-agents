import { describe, expect, test } from 'vitest';
import { getAgentConfigs } from '../../agents';
import { type PluginConfig, SUBAGENT_NAMES } from '../../config';
import { getBundledSkillRegistry } from '../core/skills';
import { opencodeAdapter, renderOpenCodeAgentConfigs } from './opencode';

const GOVERNANCE_PROMPT_SECTIONS = {
  orchestrator: [
    'delegate-first',
    'Internal handoff fields',
    'root-owned session context',
    'task instructions plus handoff recovery instructions only',
    'propose -> spec -> design -> tasks',
  ],
  explorer: [
    'Mode: read-only',
    'Return decision-ready evidence',
    'handoff recovery instructions',
    'Never write memory',
  ],
  deep: [
    'Mode: write-capable',
    'Do not skip verification',
    'parent-session handoff summary',
    'Never discard working-tree changes',
  ],
} as const;

describe('OpenCode harness adapter', () => {
  test('maps the shared seven-agent roster back to the current OpenCode AgentConfig output', () => {
    const adapterConfigs = renderOpenCodeAgentConfigs();
    const baselineConfigs = getAgentConfigs();

    expect(Object.keys(adapterConfigs).sort()).toEqual(
      ['orchestrator', ...SUBAGENT_NAMES].sort(),
    );
    expect(adapterConfigs).toEqual(baselineConfigs);
  });

  test('preserves configured OpenCode agent defaults and overrides', () => {
    const config: PluginConfig = {
      agents: {
        orchestrator: { model: 'test/orchestrator', temperature: 0.2 },
        explorer: { model: 'test/explorer', steps: 12 },
        quick: {
          permission: {
            read: 'allow',
            edit: 'deny',
          },
        },
      },
    };

    const adapterConfigs = renderOpenCodeAgentConfigs(config);
    const baselineConfigs = getAgentConfigs(config);

    expect(adapterConfigs).toEqual(baselineConfigs);
    expect(adapterConfigs.orchestrator.mode).toBe('primary');
    expect(adapterConfigs.explorer.mode).toBe('subagent');
    expect(adapterConfigs.quick.permission).toEqual({
      read: 'allow',
      edit: 'deny',
    });
  });

  test('retains key prompt governance sections for OpenCode roles', () => {
    const configs = renderOpenCodeAgentConfigs();

    for (const [agentName, promptSections] of Object.entries(
      GOVERNANCE_PROMPT_SECTIONS,
    )) {
      const prompt = configs[agentName]?.prompt;
      expect(typeof prompt).toBe('string');

      for (const section of promptSections) {
        expect(prompt).toContain(section);
      }
    }
  });

  test('exposes OpenCode capability and skill metadata without generating Codex artifacts', () => {
    expect(opencodeAdapter.id).toBe('opencode');
    expect(opencodeAdapter.capabilities).toMatchObject({
      agentDefinitions: 'supported',
      runtimeHooks: 'supported',
      skillPackaging: 'supported',
      memoryGovernanceEnforcement: 'supported',
    });

    const result = opencodeAdapter.render({ projectRoot: process.cwd() });

    expect(result.harness).toBe('opencode');
    expect(result.diagnostics).toEqual([]);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({
      harness: 'opencode',
      kind: 'agent-config',
      path: 'opencode.agent.config.json',
    });
    expect(
      result.artifacts.some((artifact) =>
        artifact.path.startsWith('.codex-plugin/'),
      ),
    ).toBe(false);
    expect(getBundledSkillRegistry().map((skill) => skill.name)).toContain(
      'sdd-apply',
    );
    expect(result.artifacts[0]?.content.toString()).not.toContain('codex');
  });

  test('inherits shared handoff semantics without Codex-only dispatch wording', () => {
    const content = String(
      opencodeAdapter.render({ projectRoot: process.cwd() }).artifacts[0]
        ?.content,
    );

    expect(content).toContain('root-owned session context');
    expect(content).toContain(
      'must not be embedded in the initial sub-agent prompt',
    );
    expect(content).toContain(
      'task instructions plus handoff recovery instructions only',
    );
    expect(content).toContain('parent-session handoff summary');
    expect(content).toContain('sdd/{change}/{artifact}');
    expect(content).not.toContain('multi_agent_v1.spawn_agent');
    expect(content).not.toContain('`message`');
    expect(content).not.toContain('`items`');
    expect(content).not.toContain('fork_context');
  });
});
