import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  getAgentPackContract,
  getImplementationOwnershipInstructions,
} from '../core/agent-pack';
import type { HarnessArtifact } from '../types';
import {
  CODEX_CAPABILITIES,
  codexAdapter,
  renderCodexRootInstructions,
  renderLegacyCodexAgentArtifacts,
} from './codex';

function render() {
  return codexAdapter.render({
    projectRoot: process.cwd(),
  });
}

function artifact(
  artifacts: HarnessArtifact[],
  suffix: string,
): HarnessArtifact | undefined {
  return artifacts.find((entry) => entry.path.endsWith(suffix));
}

function agentContent(name: string): string {
  return String(
    artifact(render().artifacts, `.codex/agents/thoth-agents-${name}.toml`)
      ?.content,
  );
}

describe('Codex adapter v0.3', () => {
  test('renders canonical default-first ownership with discovery navigation and a pre-tool check', () => {
    const root = renderCodexRootInstructions();
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
      /by default, specialists perform discovery of unlocated source, external research and substantive implementation; you direct, decide, accept and synthesize/i,
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
    expect
      .soft(block)
      .toContain('name the unknown location in the assignment, no pre-reading');
    expect
      .soft(block)
      .toContain('Navigation/fallbacks govern investigators, not root.');
    expect
      .soft(block)
      .toContain(
        'Before first read/search/shell each turn: bounded known source in a direct-work exception or dispatch',
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
  test('reports Codex capabilities and instruction-level boundaries', () => {
    expect(codexAdapter.id).toBe('codex');
    expect(CODEX_CAPABILITIES).toMatchObject({
      agentDefinitions: 'supported',
      delegatedExecution: 'supported',
      parallelDelegation: 'supported',
      rolePermissions: 'instruction-only',
      parentContextInjection: 'instruction-only',
      memoryGovernanceEnforcement: 'instruction-only',
    });
  });

  test('renders the canonical five specialist TOML files', () => {
    const paths = render()
      .artifacts.filter((entry) => entry.kind === 'agent-config')
      .map((entry) => entry.path);

    expect(paths).toEqual([
      '.codex/agents/thoth-agents-explorer.toml',
      '.codex/agents/thoth-agents-librarian.toml',
      '.codex/agents/thoth-agents-oracle.toml',
      '.codex/agents/thoth-agents-designer.toml',
      '.codex/agents/thoth-agents-worker.toml',
    ]);
  });

  test('renders a compact Codex root coordinator', () => {
    const root = renderCodexRootInstructions();

    // Includes canonical discovery/navigation guidance and the Codex dialect.
    expect(root.length).toBeLessThanOrEqual(14_800);
    expect(root).toContain('root coordinator');
    expect(root).toContain(
      'Direct-work exceptions: known low-risk mechanical work (reviewed commits included)',
    );
    expect(root).toContain(
      'By default, specialists perform discovery of unlocated source, external research and substantive implementation',
    );
    expect(root).not.toContain('delegation creates net gain');
    expect(root).toContain('<implementation-ownership>');
    expect(root).toMatch(
      /specialists perform discovery.*you direct, decide, accept/is,
    );
    expect(root).not.toMatch(/another search or dependency ends it/i);
    expect(root).not.toMatch(/Direct micro-action/i);
    expect(root).not.toMatch(/Artifact-backed implement follows/i);
    expect(root).toContain('.thoth/changes/<id>/<id>.md');
    expect(root).toContain('collaboration.spawn_agent');
    expect(root).toContain('request_user_input');
    expect(root).toContain('thoth-sdd');
    expect(root).toContain('Final verification is mandatory:');
    expect(root).toContain(
      'trivial deterministic low-risk work may use focused root checks',
    );
    expect(root).toContain('oracle');
    expect(root).not.toContain('delegate-first');
    expect(root).not.toContain('requirements-interview');
    expect(root).not.toContain('task_status');
    expect(root).not.toContain('<phase-protocols>');
  });

  test('renders Codex-native fresh and continuation lifecycle guidance', () => {
    const root = renderCodexRootInstructions();

    expect(root).toContain(
      '`collaboration.spawn_agent` with `fork_turns: "none"`',
    );
    expect(root).toContain(
      '`collaboration.followup_task` for the existing agent',
    );
    expect(root).toContain(
      'children get role instructions from the plugin hook, not inherited history',
    );
    expect(root).not.toContain('task_id');
    expect(root).not.toContain('SendMessage');
  });

  test('selects the native role with history-free spawning', () => {
    const root = renderCodexRootInstructions();
    expect(root).toContain(
      '`spawn_agent.agent_type` to the selected canonical role',
    );
    expect(root).toContain('always set `fork_turns: "none"`');
    expect(root).not.toContain('role-prefixed `task_name`');
  });

  test('renders canonical routable descriptions for every specialist', () => {
    for (const name of [
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'worker',
    ]) {
      const content = agentContent(name);
      expect(content, name).toContain('Use when:');
      expect(content, name).toContain('Do not use when:');
      expect(content, name).toContain('Escalate when:');
      expect(content, name).toContain('Verification:');
    }
  });

  test('renders read-only and writer sandbox boundaries', () => {
    const explorer = agentContent('explorer');
    const worker = agentContent('worker');

    expect(explorer).toContain('sandbox_mode = "read-only"');
    expect(explorer).not.toContain('<role>');
    expect(worker).toContain('sandbox_mode = "workspace-write"');
    expect(worker).not.toContain('<role>');
  });

  test('does not bundle a memory provider MCP', () => {
    const content = render()
      .artifacts.filter((entry) => entry.kind === 'mcp-config')
      .map((entry) => String(entry.content))
      .join('\n');

    expect(content).toContain('context7');
    expect(content).toContain('grep_app');
    expect(content).not.toContain('thoth_mem');
  });

  test('packages stable Codex-only hooks with canonical root and authoritative role payloads', () => {
    const result = render();
    const content = (path: string) =>
      String(artifact(result.artifacts, path)?.content);
    const hooks = JSON.parse(content('codex-hooks/hooks.json')).hooks;
    const command = `node -e "require(require('path').join(process.env.PLUGIN_ROOT,'codex-hooks','context.cjs'))"`;
    const handler = {
      type: 'command',
      command,
      commandWindows: command,
      timeout: 10,
      additionalContextLimit: 0,
    };
    expect(hooks.SessionStart).toEqual([
      { matcher: '^(startup|resume|clear|compact)$', hooks: [handler] },
    ]);
    expect(hooks.SubagentStart).toHaveLength(1);
    expect(hooks.SubagentStart[0].hooks).toEqual([handler]);
    const gateCommand = `node -e "import(require('url').pathToFileURL(require('path').join(process.env.PLUGIN_ROOT,'thoth-hooks','gate-verdict.mjs')).href)"`;
    expect(hooks.PostToolUse).toEqual([
      {
        matcher: '^(multi_agent_v1)?wait_agent$',
        hooks: [
          { ...handler, command: gateCommand, commandWindows: gateCommand },
        ],
      },
    ]);
    const matcher = new RegExp(hooks.SubagentStart[0].matcher);
    const tomls = result.artifacts.filter((a) => a.kind === 'agent-config');
    expect(tomls).toHaveLength(5);
    for (const toml of tomls) {
      const name = String(toml.content).match(/^name = "([^"]+)"/m)?.[1] ?? '';
      expect(matcher.test(name)).toBe(true);
      expect(matcher.test(`thoth-agents-${name}`)).toBe(false);
      expect(matcher.test(`${name}-extra`)).toBe(false);
      const payload = content(`codex-hooks/payloads/${name}.md`);
      expect(
        payload.startsWith(
          `These are the authoritative ${name} instructions; they supersede any inherited orchestrator context.`,
        ),
      ).toBe(true);
      expect(String(toml.content)).toContain(
        'developer_instructions = "Role instructions are delivered as developer context at session start by the thoth-agents plugin hook."',
      );
      expect(String(toml.content)).not.toContain('<role>');
      expect(String(toml.content).split('\n').filter(Boolean)).toHaveLength(6);
      expect(payload).toContain('<role>');
    }
    for (const unknown of ['orchestrator', 'default', 'unknown', ''])
      expect(matcher.test(unknown)).toBe(false);
    const root = content('codex-hooks/payloads/root.md');
    expect(root).toBe(
      renderCodexRootInstructions()
        .replace(/^<!-- thoth-agents:codex-root:start -->\n/, '')
        .replace(/\n<!-- thoth-agents:codex-root:end -->\n$/, ''),
    );
    expect(root.length).toBeLessThanOrEqual(14_800);
    for (const rule of [
      'multi-agent v1 `wait_agent` + enabled/trusted plugin hooks only',
      '`agent` = status-map key, not provenance',
      'V2 `FINAL_ANSWER` inter-agent messages: no hook/verdict; use compact fallback.',
      'unchanged result; it prints the compact summary',
    ])
      expect(root).toContain(rule);
    expect(root).not.toContain('<!-- thoth-agents:codex-root:');
    const configured = codexAdapter.render({
      projectRoot: process.cwd(),
      config: { agents: { oracle: { model: 'openai/gpt-5.4' } } },
    });
    expect(content('codex-hooks/hooks.json')).toBe(
      String(artifact(configured.artifacts, 'codex-hooks/hooks.json')?.content),
    );
    expect(result.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'codex.hooks.event.unsupported' }),
      ]),
    );
  });

  test('declares the thoth-owned bundled skill directory', () => {
    const result = render();
    const manifest = JSON.parse(
      String(artifact(result.artifacts, '.codex-plugin/plugin.json')?.content),
    ) as Record<string, unknown>;

    expect(manifest.skills).toBe('./skills/');
    expect(
      result.artifacts.some((entry) => entry.path === '.codex-plugin/skills/'),
    ).toBe(false);
  });
});

// Captured before AC-4: full 0.7.0 artifacts must not follow current prompt edits.
test('retains exact 0.7.0 full TOMLs for legacy ownership matching', () => {
  expect(
    createHash('sha256')
      .update(JSON.stringify(renderLegacyCodexAgentArtifacts()))
      .digest('hex'),
  ).toBe('4bd406e6ffeeafe576464901fba9f2aea44fadf12f1f631f5274a684ea778d46');
});
