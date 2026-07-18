import * as fs from 'node:fs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import type { PluginConfig } from '../../config';
import {
  CODEX_CAPABILITIES,
  codexAdapter,
  renderCodexRootInstructions,
} from './codex';

const FORBIDDEN_CODEX_ADAPTATION_MARKERS = [
  '<codex-adaptation>',
  '</codex-adaptation>',
  '<codex-root-adaptation>',
  '</codex-root-adaptation>',
  'codex-adaptation',
  'codex-root-adaptation',
  'Codex prompt notes',
  'Codex root coordination notes',
  'opencode-role-contract',
  'OpenCode role contract',
  'adapted from OpenCode',
  'same behavior in Codex',
  'Codex adaptation',
  'OpenCode-equivalent',
] as const;

function codexFixture(name: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'src/harness/__fixtures__/codex', name),
    'utf8',
  );
}

function agentContent(agentName: string): string {
  const result = codexAdapter.render({ projectRoot: process.cwd() });
  const artifact = result.artifacts.find(
    (candidate) =>
      candidate.path === `.codex/agents/thoth-agents-${agentName}.toml`,
  );

  expect(artifact).toBeDefined();
  return String(artifact?.content);
}

function artifactContent(artifactPath: string, config?: PluginConfig): string {
  const context = { projectRoot: process.cwd(), config };
  const result = codexAdapter.render(context);
  const artifact = result.artifacts.find(
    (candidate) => candidate.path === artifactPath,
  );

  expect(artifact).toBeDefined();
  return String(artifact?.content);
}

function expectTomlField(content: string, field: string, value: string): void {
  expect(content).toContain(`${field} = "${value}"`);
}

function expectTomlFieldMissing(content: string, field: string): void {
  expect(content).not.toContain(`${field} =`);
}

function expectNoLeakedCodexAdaptationMarkers(content: string): void {
  for (const marker of FORBIDDEN_CODEX_ADAPTATION_MARKERS) {
    expect(content).not.toContain(marker);
  }
}

function writePackageJson(
  directory: string,
  packageJson: { name: string; version: string },
): void {
  fs.mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
}

describe('Codex adapter', () => {
  test('renders the confirmed model and effort defaults for every subagent', () => {
    const expected = {
      oracle: { model: 'gpt-5.6-sol', effort: 'high' },
      librarian: { model: 'gpt-5.6-luna', effort: 'low' },
      explorer: { model: 'gpt-5.6-luna', effort: 'low' },
      designer: { model: 'gpt-5.6-terra', effort: 'high' },
      quick: { model: 'gpt-5.6-luna', effort: 'medium' },
      deep: { model: 'gpt-5.6-terra', effort: 'xhigh' },
    } as const;

    for (const [role, defaults] of Object.entries(expected)) {
      const content = agentContent(role);
      expectTomlField(content, 'model', defaults.model);
      expectTomlField(content, 'model_reasoning_effort', defaults.effort);
    }
  });

  test('resolves the root package version by walking upward from the current working directory', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'codex-version-'));
    const repoRoot = path.join(workspace, 'repo');
    const nestedCwd = path.join(repoRoot, 'dist', 'cli');

    try {
      writePackageJson(workspace, {
        name: 'thoth-agents',
        version: '1.2.3',
      });
      writePackageJson(repoRoot, {
        name: 'not-thoth-agents',
        version: '9.9.9',
      });
      fs.mkdirSync(nestedCwd, { recursive: true });

      const previousCwd = process.cwd();
      process.chdir(nestedCwd);
      try {
        const result = codexAdapter.render({ projectRoot: workspace });
        const pluginManifest = JSON.parse(
          String(
            result.artifacts.find(
              (artifact) => artifact.path === '.codex-plugin/plugin.json',
            )?.content,
          ),
        ) as { version?: unknown };

        expect(pluginManifest.version).toBe('1.2.3');
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('resolves the plugin version from an installed package root when caller cwd is outside the repo', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'codex-dlx-'));
    const callerProject = path.join(workspace, 'caller-project');
    const installedPackageRoot = path.join(
      workspace,
      'store',
      'node_modules',
      'thoth-agents',
    );

    try {
      fs.mkdirSync(callerProject, { recursive: true });
      writePackageJson(installedPackageRoot, {
        name: 'thoth-agents',
        version: '7.8.9',
      });

      const previousCwd = process.cwd();
      process.chdir(callerProject);
      try {
        const result = codexAdapter.render({
          projectRoot: callerProject,
          packageRoot: installedPackageRoot,
        });
        const pluginManifest = JSON.parse(
          String(
            result.artifacts.find(
              (artifact) => artifact.path === '.codex-plugin/plugin.json',
            )?.content,
          ),
        ) as { version?: unknown };

        expect(pluginManifest.version).toBe('7.8.9');
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  test('plans six role agent artifacts from validated Codex surfaces', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });

    const agentArtifacts = result.artifacts.filter(
      (artifact) => artifact.kind === 'agent-config',
    );

    expect(result.harness).toBe('codex');
    expect(agentArtifacts.map((artifact) => artifact.path)).toEqual([
      '.codex/agents/thoth-agents-explorer.toml',
      '.codex/agents/thoth-agents-librarian.toml',
      '.codex/agents/thoth-agents-oracle.toml',
      '.codex/agents/thoth-agents-designer.toml',
      '.codex/agents/thoth-agents-quick.toml',
      '.codex/agents/thoth-agents-deep.toml',
    ]);
    expect(String(agentArtifacts[0].content)).toContain(
      'developer_instructions',
    );
  });

  test('plans config, MCP, skill manifest, and explicit capability diagnostics only', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });

    expect(result.artifacts.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining(['harness-config', 'mcp-config', 'manifest']),
    );
    expect(
      result.artifacts.some(
        (artifact) => artifact.path === '.codex-plugin/hooks/hooks.json',
      ),
    ).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'codex.surface.hooks.unvalidated' }),
        expect.objectContaining({
          code: 'codex.permission.memory.enforcement_gap',
        }),
        expect.objectContaining({
          code: 'codex.context.parent_injection.unvalidated',
        }),
      ]),
    );
    expect(result.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: 'programmatic-delegation-runtime',
        }),
      ]),
    );
  });

  test('packages only unrelated MCP servers in the Codex plugin payload', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });
    const mcpArtifact = result.artifacts.find(
      (artifact) => artifact.path === '.codex-plugin/.mcp.json',
    );

    expect(mcpArtifact).toBeDefined();
    const mcpConfig = JSON.parse(String(mcpArtifact?.content));

    expect(mcpConfig).toEqual({
      mcpServers: {
        context7: { url: 'https://mcp.context7.com/mcp' },
        grep_app: { url: 'https://mcp.grep.app' },
        exa: {
          command: 'npx',
          args: ['-y', 'exa-mcp-server'],
        },
      },
    });
    expect(String(mcpArtifact?.content)).not.toContain('mcp_servers');
    expect(String(mcpArtifact?.content)).not.toContain('curl');
    expect(String(mcpArtifact?.content)).not.toContain('CONTEXT7_API_KEY');
    expect(Object.keys(mcpConfig.mcpServers).sort()).toEqual([
      'context7',
      'exa',
      'grep_app',
    ]);
  });

  test('does not package arbitrary no-op Codex hooks when no source hook is portable', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });
    const manifest = JSON.parse(
      String(
        result.artifacts.find(
          (artifact) => artifact.path === '.codex-plugin/plugin.json',
        )?.content,
      ),
    );

    expect(manifest.hooks).toBeUndefined();
    expect(
      result.artifacts.some(
        (artifact) => artifact.path === '.codex-plugin/hooks/hooks.json',
      ),
    ).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'codex.plugin.hooks.none_packaged' }),
      ]),
    );
  });

  test('includes plugin package manifest and plugin-local skills by default', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });
    const paths = result.artifacts.map((artifact) => artifact.path);

    expect(paths).toContain('.codex-plugin/plugin.json');
    expect(paths).toContain('.codex-plugin/skills/.thoth-agents-manifest.json');
    expect(
      paths.some((artifactPath) =>
        artifactPath.startsWith('.codex-plugin/skills/sdd-apply/'),
      ),
    ).toBe(true);
    expect(
      paths.some((artifactPath) => artifactPath.startsWith('.agents/skills/')),
    ).toBe(false);
    expect(artifactContent('.codex-plugin/plugin.json')).toContain(
      '"skills": "./skills/"',
    );
    expect(paths).not.toContain(
      '.codex-plugin/skills/thoth-mem-agents/SKILL.md',
    );
    expect(
      artifactContent('.codex-plugin/skills/.thoth-agents-manifest.json'),
    ).not.toContain('thoth-mem-agents');
  });

  test('emits .agents skills only for explicit repo-local fallback mode', () => {
    const result = codexAdapter.render({
      projectRoot: process.cwd(),
      options: {
        codexSkillOutputModes: ['plugin-package', 'repo-local-fallback'],
      },
    });
    const paths = result.artifacts.map((artifact) => artifact.path);

    expect(paths).toContain('.codex-plugin/plugin.json');
    expect(
      paths.some((artifactPath) =>
        artifactPath.startsWith('.codex-plugin/skills/sdd-apply/'),
      ),
    ).toBe(true);
    expect(
      paths.some((artifactPath) =>
        artifactPath.startsWith('.agents/skills/sdd-apply/'),
      ),
    ).toBe(true);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'codex.skill.duplicate_scope_precedence_unverified',
        }),
      ]),
    );
  });

  test('renders provider-neutral authorization and continuity outcomes for subagents', () => {
    const explorer = agentContent('explorer');
    const quick = agentContent('quick');
    const deep = agentContent('deep');

    expect(explorer).toContain('parent-scoped authorization');
    expect(explorer).toContain('authorized context');

    for (const prompt of [quick, deep]) {
      expect(prompt).toContain('parent-scoped authorization');
      expect(prompt).toContain('sdd/{change}/{artifact}');
      expect(prompt).not.toMatch(
        /mem_(?:save|recall|get|context|project|session)\s*\(/,
      );
      expect(prompt).toContain('`request_user_input`');
      expect(prompt).toContain('functions.update_plan');
      expect(prompt).not.toContain('`question`');
      expect(prompt).not.toContain('todowrite');
    }
  });

  test('renders Codex subagent prompts from semantic sections with Codex terminology', () => {
    const explorer = agentContent('explorer');
    const oracle = agentContent('oracle');
    const designer = agentContent('designer');
    const quick = agentContent('quick');
    const deep = agentContent('deep');

    for (const prompt of [explorer, oracle]) {
      expect(prompt).toContain('Mode: read-only');
      expect(prompt).toContain('Single-task leaf agent: do not delegate');
      expect(prompt).toContain('authorized context');
      expect(prompt).not.toMatch(
        /mem_(?:save|recall|get|context|project|session)\s*\(/,
      );
      expect(prompt).toContain('request_user_input');
      expect(prompt).not.toContain('Use `question` only');
    }

    expect(oracle).toContain('plan-reviewer for SDD plans');
    expect(explorer).toContain('Return exactly these sections');
    expect(designer).toContain('owns screenshots and visual QA');

    for (const prompt of [designer, quick, deep]) {
      expect(prompt).toContain('Mode: write-capable');
      expect(prompt).toContain('collaboration.spawn_agent only');
      expect(prompt).toContain('Never discard working-tree changes');
      expect(prompt).toContain('writes under the orchestrator');
      expect(prompt).toContain('For SDD tasks: use the Task Result envelope');
      expect(prompt).toContain('request_user_input');
      expect(prompt).not.toContain('Use `question` only');
    }

    expect(quick).toContain("Treat the orchestrator's internal handoff");
    expect(deep).toContain(
      'Use test-driven-development and systematic-debugging',
    );
  });

  test('Codex prompt generation uses semantic Codex contracts instead of exact OpenCode prose substitutions', () => {
    const rootInstructions = renderCodexRootInstructions();
    const explorer = agentContent('explorer');
    const quick = agentContent('quick');

    expect(rootInstructions).toContain('ambient Codex root session');
    expect(rootInstructions).toContain('installed Codex role agents');
    expect(rootInstructions).toContain('sdd-tasks -> quick subagent');
    expect(rootInstructions).toContain('sdd-verify -> oracle subagent');

    expect(explorer).toContain('Dispatch method: collaboration.spawn_agent');
    expect(explorer).toContain('Mode: read-only');
    expect(explorer).toContain('Return exactly these sections');
    expect(quick).toContain(
      'Dispatch method: synchronous collaboration.spawn_agent only',
    );
    expect(quick).toContain('Mode: write-capable');
    expect(quick).toContain('fast bounded implementation');

    for (const prompt of [rootInstructions, explorer, quick]) {
      expect(prompt).toContain('request_user_input');
      expect(prompt).not.toContain('`question`');
      expect(prompt).not.toContain('`task_status`');
      expect(prompt).not.toContain('`todowrite`');
      expect(prompt).not.toContain('@explorer');
      expect(prompt).not.toContain('@quick');
    }
  });

  test('does not invent unavailable Codex delegation session cleanup', () => {
    const rootInstructions = renderCodexRootInstructions();
    const explorer = agentContent('explorer');
    const quick = agentContent('quick');

    expect(rootInstructions).toContain('ambient Codex root session');
    for (const prompt of [rootInstructions, explorer, quick]) {
      expect(prompt).not.toContain('close_agent');
      expect(prompt).not.toContain('close its session');
      expect(prompt).not.toContain('close that subagent session');
    }
  });

  test('does not leak internal Codex adaptation markers into rendered prompts', () => {
    const rootInstructions = renderCodexRootInstructions();

    expectNoLeakedCodexAdaptationMarkers(rootInstructions);

    for (const role of [
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'quick',
      'deep',
    ]) {
      expectNoLeakedCodexAdaptationMarkers(agentContent(role));
    }
  });

  test('renders root managed block as native root instructions immediately after delimiter', () => {
    const rootInstructions = renderCodexRootInstructions();
    const linesAfterStart = rootInstructions
      .split('\n')
      .slice(1)
      .filter((line) => line.trim().length > 0);

    expect(linesAfterStart[0]).toBe('<role>');
    expect(rootInstructions).toContain(
      'You are the delegate-first root coordinator',
    );
    expect(rootInstructions).toContain(
      'small bounded local inspection when cheaper, faster, or clearer than delegation',
    );
    expect(rootInstructions).toContain(
      'Delegate broad search, multi-file edits, risky verification, UI visual QA, independent review',
    );
    expect(rootInstructions).toContain(
      'Verify material user/agent claims before relying on them',
    );
    expect(rootInstructions).toContain(
      'correct it plainly, explain tradeoffs, and offer alternatives',
    );
    expect(rootInstructions).toContain(
      'net quality, speed, cost, and reliability',
    );
    expect(rootInstructions).toContain('request_user_input');
    expect(rootInstructions).toContain(
      'features.default_mode_request_user_input',
    );
    expect(rootInstructions).toContain(
      'Whenever the root orchestrator calls `request_user_input`, it MUST NEVER set or pass `autoResolutionMs`; omit the field entirely.',
    );
    expect(rootInstructions).toContain('installed Codex role agents');
    expect(rootInstructions).toContain(
      'The ambient Codex root session is the root/main orchestrator',
    );
    expect(rootInstructions).toContain('installed provider guidance');
    expect(rootInstructions).toContain(
      'resumable summary or checkpoint outcome',
    );
    expect(rootInstructions).not.toMatch(
      /mem_(?:save|recall|get|context|project|session)\s*\(/,
    );
    expect(rootInstructions).toContain(
      'resolve the stable root session identity from Codex request metadata',
    );
    expect(rootInstructions).toContain('x-codex-turn-metadata');
    expect(rootInstructions).toContain(
      'If `nodeRepl.requestMeta` is not yet visible and `tool_search` is available',
    );
    expect(rootInstructions).toContain(
      'load/discover the `node_repl` MCP tool',
    );
    expect(rootInstructions).toContain('threadId');
    expect(rootInstructions).toContain(
      '`nodeRepl.requestMeta["x-codex-turn-metadata"].turn_id`',
    );
    expect(rootInstructions).toContain('per-turn');
    expect(rootInstructions).toContain('not the stable root session id');
    expect(rootInstructions).toContain(
      'Delegate by invoking `collaboration.spawn_agent`',
    );
    expect(rootInstructions).toContain(
      'The user has explicitly authorized this generated Codex orchestrator to use `collaboration.spawn_agent` whenever delegation is required by these instructions, without needing a fresh user request for subagents in each task.',
    );
    expect(rootInstructions).toContain(
      'delegated task instructions plus handoff retrieval instructions in `message`',
    );
    expect(rootInstructions).toContain(
      'Do not include the handoff body in `message`',
    );
    expect(rootInstructions).toContain(
      '`collaboration.wait_agent` waits for mailbox updates',
    );
    expect(rootInstructions).toContain(
      '`collaboration.send_message` delivers a message without triggering a turn',
    );
    expect(rootInstructions).toContain(
      '`collaboration.followup_task` triggers a turn when an idle task must continue',
    );
    expect(rootInstructions).toContain(
      '`collaboration.list_agents` with the same task path',
    );
    expect(rootInstructions).toContain(
      '`collaboration.interrupt_agent` only for explicit cancellation, a deadline, or supersession',
    );
    expect(rootInstructions).toContain(
      '`task_name`, `message`, and optional `fork_turns`',
    );
    expect(rootInstructions).toContain(
      '`fork_turns` must be `none`, `all`, or a positive integer string',
    );
    expect(rootInstructions).toContain(
      'Role behavior is carried by `task_name` and `message`',
    );
    expect(rootInstructions).toContain(
      'Collaboration tools are direct tools and must not be called from inside `functions.exec`',
    );
    for (const obsolete of [
      'multi_agent_v1',
      'agent_type',
      '`items`',
      'fork_context',
      'send_input',
      'resume_agent',
      'close_agent',
    ]) {
      expect(rootInstructions).not.toContain(obsolete);
    }
  });

  test('renders same-session lifecycle guards without claiming runtime enforcement', () => {
    const rootInstructions = renderCodexRootInstructions();

    expect(rootInstructions).toContain(
      'as in progress and probe the same session via',
    );
    expect(rootInstructions).toContain(
      '`collaboration.list_agents on the same task path`',
    );
    expect(rootInstructions).toContain(
      'no retry/reroute/interruption before `terminal mailbox completion or failure update`',
    );
    expect(rootInstructions).toContain(
      'Terminal result-quality and required-artifact checks share one sharpened retry; nonterminal probes use none.',
    );
    expect(rootInstructions).toContain(
      'A `collaboration.wait_agent` timeout or silence is nonterminal and remains in progress',
    );
    expect(rootInstructions).not.toMatch(
      /wait_agent[^.\n]*\d+\s*(?:ms|seconds?|minutes?)/i,
    );
  });

  test('renders provider-neutral Codex handoff guidance using the current spawn contract', () => {
    const rootInstructions = renderCodexRootInstructions();

    expect(rootInstructions).toContain(
      'Pass the self-contained delegated task instructions plus authorized handoff context in `message`',
    );
    expect(rootInstructions).toContain(
      'do not embed the root-owned handoff summary body in `message`',
    );
    expect(rootInstructions).toContain(
      'Do not include the handoff body in `message`',
    );
    expect(rootInstructions).toContain('optional `fork_turns`');
    expect(rootInstructions).toContain(
      'Memory ownership, authorized handoff context, permissions, and prompt-body exclusion are instruction-level',
    );
    expect(rootInstructions).toContain(
      'resumable summary or checkpoint outcome',
    );
    expect(rootInstructions).toContain('installed provider guidance');
    expect(rootInstructions).not.toMatch(
      /mem_(?:save|recall|get|context|project|session)\s*\(/,
    );
    expect(rootInstructions).toContain('HAS_TOPIC_KEY');
    expect(rootInstructions).toContain('HAS_WHAT');
    expect(rootInstructions).toContain('HAS_WHY');
    expect(rootInstructions).toContain('HAS_WHERE');
    expect(rootInstructions).toContain('HAS_LEARNED');
    expect(rootInstructions).not.toContain(
      'Include the internal handoff in `message`',
    );
  });

  test('renders subagent developer instructions as native multiline role instructions without adaptation wrapper', () => {
    const deep = agentContent('deep');
    const developerInstructions = deep.match(
      /developer_instructions = """\n(?<value>[\s\S]*?)\n"""/,
    )?.groups?.value;

    expect(developerInstructions).toBeDefined();
    expect(developerInstructions?.startsWith('<role>')).toBe(true);
    expect(developerInstructions).toContain('You are deep.');
    expect(developerInstructions).toContain(
      'Dispatch method: synchronous collaboration.spawn_agent only',
    );
    expect(developerInstructions).toContain('request_user_input');
  });

  test('renders canonical minimal Codex subagent TOML fields only', () => {
    for (const role of [
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'quick',
      'deep',
    ]) {
      const content = artifactContent(
        `.codex/agents/thoth-agents-${role}.toml`,
      );

      expect(content).toContain('name = ');
      expect(content).toContain('description = ');
      expect(content).toContain('developer_instructions = """\n');
      expect(content).toContain('model = ');
      expect(content).toContain('model_reasoning_effort = ');
      expect(content).toContain('sandbox_mode = ');
      expect(content).not.toContain('mcp_servers');
      expect(content).not.toContain('skills.config');
      expect(content).not.toContain('[skills');
      expect(content).not.toContain('hooks =');
      expect(content).not.toContain('[hooks');
      expect(content).not.toContain('approval_policy');
      expect(content).not.toContain('agents = ');
    }
  });

  test('does not render a selectable Codex orchestrator TOML', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });

    expect(
      result.artifacts.some(
        (artifact) =>
          artifact.path === '.codex/agents/thoth-agents-orchestrator.toml',
      ),
    ).toBe(false);
  });

  test('renders Codex-only default models for generated subagents', () => {
    const expectedModels = {
      oracle: 'gpt-5.6-sol',
      librarian: 'gpt-5.6-luna',
      explorer: 'gpt-5.6-luna',
      designer: 'gpt-5.6-terra',
      quick: 'gpt-5.6-luna',
      deep: 'gpt-5.6-terra',
    } as const;

    for (const [role, model] of Object.entries(expectedModels)) {
      expectTomlField(
        artifactContent(`.codex/agents/thoth-agents-${role}.toml`),
        'model',
        model,
      );
    }

    expectTomlFieldMissing(artifactContent('.codex/config.toml'), 'model');
  });

  test('omits default effort when a custom model is configured', () => {
    const config: PluginConfig = {
      agents: {
        oracle: { model: 'gpt-5.5-codex-custom' },
        explorer: { model: [{ id: 'gpt-5.4-mini-custom' }] },
      },
    };

    for (const role of ['oracle', 'explorer']) {
      expectTomlFieldMissing(
        artifactContent(`.codex/agents/thoth-agents-${role}.toml`, config),
        'model_reasoning_effort',
      );
    }
    expectTomlField(
      artifactContent('.codex/agents/thoth-agents-deep.toml', config),
      'model_reasoning_effort',
      'xhigh',
    );
  });

  test('uses existing per-agent model overrides for Codex subagents only', () => {
    const config: PluginConfig = {
      agents: {
        oracle: { model: 'gpt-5.5-codex-custom' },
        explorer: { model: [{ id: 'gpt-5.4-mini-custom' }] },
        orchestrator: { model: 'gpt-5.5-root-custom' },
      },
    };

    expectTomlField(
      artifactContent('.codex/agents/thoth-agents-oracle.toml', config),
      'model',
      'gpt-5.5-codex-custom',
    );
    expectTomlField(
      artifactContent('.codex/agents/thoth-agents-explorer.toml', config),
      'model',
      'gpt-5.4-mini-custom',
    );
    expectTomlField(
      artifactContent('.codex/agents/thoth-agents-deep.toml', config),
      'model',
      'gpt-5.6-terra',
    );

    expectTomlFieldMissing(
      artifactContent('.codex/config.toml', config),
      'model',
    );
  });

  test('memory governance remains instruction-level when Codex runtime enforcement is unsupported', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });

    expect(codexAdapter.capabilities.memoryGovernanceEnforcement).toBe(
      'instruction-only',
    );
    expect(codexAdapter.capabilities.rolePermissions).toBe('instruction-only');
    expect(
      result.artifacts.some((artifact) =>
        String(artifact.content).toLowerCase().includes('permission control'),
      ),
    ).toBe(false);
    expect(
      result.artifacts.some((artifact) =>
        artifact.description?.toLowerCase().includes('permission control'),
      ),
    ).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'codex.permission.memory.enforcement_gap',
          fallback: 'instruction-only',
          capability: 'rolePermissions',
        }),
        expect.objectContaining({
          code: 'codex.context.parent_injection.unvalidated',
          fallback: 'instruction-only',
          capability: 'parentContextInjection',
        }),
        expect.objectContaining({
          code: 'codex.permission.memory_write.enforcement_gap',
          fallback: 'instruction-only',
          capability: 'memoryGovernanceEnforcement',
        }),
      ]),
    );
  });

  test('diagnoses Codex provider-governance enforcement gaps without embedding provider calls', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });
    const diagnostics = result.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code.includes('memory') ||
        diagnostic.code.includes('parent_injection'),
    );
    const explorer = agentContent('explorer');
    const deep = agentContent('deep');

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'codex.permission.memory.enforcement_gap',
          capability: 'rolePermissions',
          fallback: 'instruction-only',
        }),
        expect.objectContaining({
          code: 'codex.context.parent_injection.unvalidated',
          capability: 'parentContextInjection',
          fallback: 'instruction-only',
        }),
        expect.objectContaining({
          code: 'codex.permission.memory_write.enforcement_gap',
          capability: 'memoryGovernanceEnforcement',
          fallback: 'instruction-only',
        }),
      ]),
    );
    expect(
      diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
    ).toContain('instruction-level guidance');
    expect(
      diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
    ).toContain('instruction-level guidance');

    for (const prompt of [explorer, deep]) {
      expect(prompt).toContain('parent-scoped authorization');
      expect(prompt).toContain('authorized context');
      expect(prompt).toContain(
        'Runtime enforcement: instruction-level unless the target harness validates per-agent memory controls.',
      );
      expect(prompt).not.toMatch(
        /mem_(?:save|recall|get|context|project|session)\s*\(/,
      );
    }

    expect(explorer).toContain('Read-only role permissions remain intact');
    expect(deep).toContain('sdd/{change}/{artifact}');
  });

  test('prompt text is not counted as runtime memory enforcement', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });
    const promptText = result.artifacts
      .filter((artifact) => artifact.kind === 'agent-config')
      .map((artifact) => String(artifact.content))
      .join('\n');

    expect(promptText).toContain('External provider memory governance');
    expect(promptText).not.toMatch(
      /mem_(?:save|recall|get|context|project|session)\s*\(/,
    );
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'codex.permission.memory.enforcement_gap',
          fallback: 'instruction-only',
        }),
      ]),
    );
    expect(codexAdapter.capabilities.memoryGovernanceEnforcement).not.toBe(
      'supported',
    );
  });

  test('keeps generic runtime hook support unknown', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });

    expect(CODEX_CAPABILITIES.runtimeHooks).toBe('unknown');
    expect(codexAdapter.capabilities.runtimeHooks).toBe('unknown');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'codex.surface.hooks.unvalidated',
          surface: 'inline-hooks',
          fallback: 'diagnostic-only',
        }),
      ]),
    );
  });

  test('diagnoses Codex hook trust and feature gates explicitly', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'codex.hooks.project_trust.required',
          surface: 'project-hooks-json',
          fallback: 'diagnostic-only',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'codex.hooks.features_hooks.required',
          surface: 'features-hooks-toggle',
          fallback: 'diagnostic-only',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'codex.hooks.plugin_trust.required',
          surface: 'plugin-hooks-bundle',
          fallback: 'diagnostic-only',
        }),
      ]),
    );
    expect(
      result.diagnostics
        .filter((diagnostic) => diagnostic.code.startsWith('codex.hooks.'))
        .map((diagnostic) => diagnostic.message)
        .join('\n'),
    ).toContain('features.hooks');
    expect(
      result.diagnostics
        .filter((diagnostic) => diagnostic.code.startsWith('codex.hooks.'))
        .map((diagnostic) => diagnostic.message)
        .join('\n'),
    ).toContain('features.plugin_hooks');
    expect(
      result.diagnostics
        .filter((diagnostic) => diagnostic.code.startsWith('codex.hooks.'))
        .map((diagnostic) => diagnostic.message)
        .join('\n'),
    ).toContain('plugin hook trust review');
    expect(
      result.diagnostics
        .filter(
          (diagnostic) =>
            diagnostic.code === 'codex.hooks.plugin_trust.required',
        )
        .map((diagnostic) => diagnostic.message)
        .join('\n'),
    ).toContain('does not enable hooks automatically');
    expect(
      result.diagnostics
        .filter(
          (diagnostic) =>
            diagnostic.code === 'codex.hooks.plugin_trust.required',
        )
        .map((diagnostic) => diagnostic.message)
        .join('\n'),
    ).toContain('hard permission enforcement');
  });

  test('omits plugin hooks without hard permission enforcement when no source hook is portable', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });

    expect(
      result.artifacts.filter((artifact) => artifact.kind === 'hook-config'),
    ).toEqual([]);
    expect(
      result.artifacts.some((artifact) =>
        artifact.path.startsWith('.codex/plugins/'),
      ),
    ).toBe(false);
    expect(
      result.artifacts.some(
        (artifact) => artifact.path === '.codex/hooks.json',
      ),
    ).toBe(false);
    expect(
      result.artifacts.some((artifact) =>
        String(artifact.content).toLowerCase().includes('hard permission'),
      ),
    ).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'codex.plugin.hooks.none_packaged',
    );
    expect(
      result.diagnostics
        .map((diagnostic) => diagnostic.message.toLowerCase())
        .join('\n'),
    ).not.toContain('automatically active');
  });

  test('matches deterministic capability diagnostics and focused deep agent contract', () => {
    const result = codexAdapter.render({ projectRoot: process.cwd() });
    const deepAgent = result.artifacts.find(
      (artifact) => artifact.path === '.codex/agents/thoth-agents-deep.toml',
    );
    const diagnostics = result.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      code: diagnostic.code,
      capability: diagnostic.capability,
      surface: diagnostic.surface,
      fallback: diagnostic.fallback,
    }));

    expect(String(deepAgent?.content)).toContain(
      'name = "deep"\ndescription = "Handle correctness-critical, multi-file, or edge-case-heavy changes with full local context analysis."',
    );
    expect(String(deepAgent?.content)).toContain(
      'Dispatch method: synchronous collaboration.spawn_agent only',
    );
    expect(String(deepAgent?.content)).toContain('functions.update_plan');
    expect(String(deepAgent?.content)).not.toContain('`todowrite`');
    expect(`${JSON.stringify(diagnostics, null, 2)}\n`).toBe(
      codexFixture('capability-diagnostics.json'),
    );
  });
});
