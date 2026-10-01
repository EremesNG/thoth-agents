import { describe, expect, test } from 'vitest';
import type { PluginConfig } from '../../config';
import { PI_CAPABILITIES, piAdapter, renderPiRootInstructions } from './pi';

describe('Pi adapter', () => {
  test.each([
    ['provider/custom-model', 'provider/custom-model'],
    [
      [{ id: 'provider/first-model' }, 'provider/fallback-model'],
      'provider/first-model',
    ],
    ['inherit', 'inherit'],
  ])('maps explicit models without inventing a thinking inheritance sentinel', (model, expected) => {
    const rendered = piAdapter.render({
      projectRoot: process.cwd(),
      config: { agents: { worker: { model } } } as PluginConfig,
    });
    const worker = rendered.artifacts.find(
      ({ path }) => path === 'agents/thoth-worker.md',
    );
    expect(worker?.content).toContain(`model: "${expected}"`);
    expect(worker?.content).not.toContain('\nthinking:');
    expect(worker?.content).not.toContain('\neffort:');
  });

  test('assigns the shared specialist model and effort preset through the Pi provider', () => {
    const expected = {
      explorer: ['gpt-6-luna', 'low'],
      librarian: ['gpt-6-luna', 'high'],
      oracle: ['gpt-6-astra', 'medium'],
      designer: ['gpt-6-sol', 'medium'],
      worker: ['gpt-6-luna', 'max'],
    };
    const rendered = piAdapter.render({ projectRoot: process.cwd() });
    for (const [role, [model, effort]] of Object.entries(expected)) {
      const artifact = rendered.artifacts.find(
        ({ path }) => path === `agents/thoth-${role}.md`,
      );
      expect(artifact?.content).toContain(`model: "openai-codex/${model}"`);
      expect(artifact?.content).toContain(`effort: "${effort}"`);
      expect(artifact?.content).toContain('subagent_mode: "background"');
      expect(artifact?.content).not.toMatch(
        /^(?:thinking|async|defaultContext|maxSubagentDepth):/m,
      );
    }
  });

  test('keeps question dialogs and session progress root-owned', () => {
    const root = renderPiRootInstructions();
    expect(root).toContain(
      'Use an available task/progress tool only when the work genuinely has multiple dependent steps.',
    );
    expect(root).toContain('actual tool name and schema');
    expect(root).toContain('lightweight written progress');
    expect(root).not.toContain('`todo`');
    expect(root).not.toContain('rpiv-todo');
    expect(root).toContain('ask_user_question');
    expect(root).toContain('one to four questions');
    expect(root).toContain('two to four options');
    expect(root).toContain('only confirmed returned empty answers count');
    expect(root).not.toContain('Use `subagent_status` only when the work');
    const children = piAdapter.render({ projectRoot: process.cwd() }).artifacts;
    for (const child of children) {
      expect(child.content).toContain(
        'Do not delegate further; root owns progress.',
      );
      expect(child.content).toContain(
        'escalate the unresolved question to the root',
      );
      expect(child.content).not.toContain('Use `ask_user_question`');
      expect(child.content).not.toContain('`undefined`');
    }
  });

  test('documents noninteractive web access tools and truthful failures', () => {
    const root = renderPiRootInstructions();
    for (const tool of [
      'web_search',
      'fetch_content',
      'get_search_content',
      'source_check',
    ])
      expect(root).toContain(tool);
    expect(root).toContain('workflow: "none"');
    expect(root).toContain('default tool names');
    expect(root).toContain('untrusted data');
    expect(root).toContain('report the limitation');
    expect(root).not.toMatch(/web_fetch|pi-exa|web_\*_exa|exa_research/);
    const librarian = piAdapter
      .render({ projectRoot: process.cwd() })
      .artifacts.find(({ path }) => path === 'agents/thoth-librarian.md');
    for (const tool of [
      'web_search',
      'fetch_content',
      'get_search_content',
      'source_check',
    ])
      expect(librarian?.content).toContain(tool);
    expect(librarian?.content).toContain('workflow: "none"');
    expect(librarian?.content).toContain('default tool names');
  });

  test('uses one direct @thoth-agents/pi-subagents launch per canonical specialist assignment', () => {
    const root = renderPiRootInstructions();
    const runtime = root.match(/<pi-runtime>([\s\S]*?)<\/pi-runtime>/)?.[1];
    expect(runtime).toContain('launch in background when neither sets a mode');
    expect(runtime).toContain('explicitly asks you to wait for completion');
    expect(runtime).toContain(
      'subagent_run({ agent: "thoth-worker", task: "…" })',
    );
    expect(runtime).toContain(
      'Use one separate `subagent_run` call per specialist, never a batch.',
    );
    expect(runtime).toContain(
      'thoth-explorer, thoth-librarian, thoth-oracle, thoth-designer, or thoth-worker',
    );
    expect(runtime?.toLowerCase()).toContain(
      'root coordinates readiness, dependencies, and acceptance',
    );
    expect(runtime).toContain(
      'instruction-level policy, not runtime enforcement',
    );
    expect(runtime).toContain(
      'follow higher-priority Pi or extension instructions',
    );
    expect(runtime).toContain(
      'report conflicts rather than claiming compliance',
    );
    expect(root).not.toMatch(
      /(?:subagents_enable|subagent\s*\(|context:\s*["'](?:fresh|semantic)["']|async\s*:|workflowScript|workflowScriptPath|runs\.)/,
    );
  });

  test('uses task-id lifecycle tools without assuming disabled continuation', () => {
    const root = renderPiRootInstructions();
    const runtime = root.match(/<pi-runtime>([\s\S]*?)<\/pi-runtime>/)?.[1];
    expect(runtime).toContain('subagent_status({ task_id })');
    expect(runtime).toContain('subagent_result({ task_id })');
    expect(runtime).toContain('subagent_cancel({ task_id })');
    expect(runtime).toContain('subagent_send_message');
    expect(runtime).toContain('Do not assume `subagent_continue` is available');
    expect(runtime).toContain('unless `enable_continue` is explicitly enabled');
    expect(runtime).toContain(
      'A terminal notification establishes task terminal status and wakes the parent',
    );
    expect(runtime).toContain(
      'retrieve the result and decide acceptance separately',
    );
    expect(runtime).toContain(
      'cancellation acknowledgements alone do not establish termination',
    );
    expect(runtime).not.toMatch(/action:\s*["'](?:status|stop|steer)["']/);
  });

  test('requires lean child resources for session-owned hook isolation', () => {
    const root = renderPiRootInstructions();
    const runtime = root.match(/<pi-runtime>([\s\S]*?)<\/pi-runtime>/)?.[1];
    expect(runtime).toContain(
      '@thoth-agents/pi-subagents SDK children run in-process',
    );
    expect(runtime).toContain('`session_resources: "lean"` is required');
    expect(runtime).toContain(
      'filters `before_agent_start` and `session_start`',
    );
    expect(runtime).toContain(
      'allowing only `tool_call`, `tool_result`, and `user_bash` extension events',
    );
    expect(runtime).toContain(
      'trusted packages listed in `lifecycle_passthrough` (default: `@thoth-agents/pi-claude-bridge` and `@thoth-agents/pi-antigravity-bridge`; never thoth-agents) keep their full extension lifecycle in children, including `session_start` and `session_shutdown`',
    );
    expect(runtime).toContain(
      'their prompt-shaping events receive cloned data with returns discarded as defense in depth, but the list is a trust list, not a sandbox',
    );
    expect(runtime).not.toContain('so they cannot change the child prompt');
    expect(runtime).toContain('full child resources are unsupported');
    expect(runtime).toContain(
      'Graceful `session_shutdown` cancels active children',
    );
    expect(runtime).toContain(
      'abrupt process shutdown or descendant termination is not guaranteed',
    );
    expect(runtime).not.toContain('PI_SUBAGENT_CHILD');
  });

  test('collects by terminal notification rather than status polling', () => {
    const root = renderPiRootInstructions();
    const shaping = root.match(/<task-shaping>([\s\S]*?)<\/task-shaping>/)?.[1];
    expect(shaping?.toLowerCase()).toContain('launch separate background runs');
    expect(shaping).toContain('before collecting results');
    expect(shaping?.toLowerCase()).toContain(
      'native terminal notifications (`triggerturn`/`followup`) wake the parent',
    );
    expect(shaping).toContain('Do not poll status or sleep merely to wait');
    expect(shaping).toContain('terminal completion notification');
    expect(shaping).toContain('cancellation-acknowledged state');
  });

  test('uses actual @thoth-agents/pi-subagents role-call examples without borrowed context semantics', () => {
    const root = renderPiRootInstructions();
    expect(root).toContain(
      'subagent_run({ agent: "thoth-worker", task: "…" })',
    );
    expect(root).toContain(
      'subagent_run({ agent: "thoth-worker", task: "…", mode: "task" })',
    );
    expect(root).toContain('optional `context` is plain supporting text');
    expect(root).not.toContain('context: "fresh"');
    expect(root).not.toContain('context: "semantic"');
  });

  test('lists only namespaced specialist identities in runtime delegation guidance', () => {
    const root = renderPiRootInstructions();
    expect(root).toContain(
      'thoth-explorer, thoth-librarian, thoth-oracle, thoth-designer, or thoth-worker',
    );
    expect(root).not.toContain(
      'agent`: explorer, librarian, oracle, designer, or worker',
    );
  });

  test('reports native, adapter-backed, conditional, and instruction-only capability states', () => {
    expect(PI_CAPABILITIES).toMatchObject({
      agentDefinitions: 'supported',
      delegatedExecution: 'supported',
      runtimeHooks: 'conditional',
      mcpConfiguration: 'adapter-backed',
      rolePermissions: 'supported',
      memoryGovernanceEnforcement: 'instruction-only',
    });
    const rendered = piAdapter.render({ projectRoot: process.cwd() });
    expect(rendered.diagnostics.map(({ code }) => code)).toEqual([
      'pi.capability.conditional-lifecycle',
      'pi.security.no-os-sandbox',
      'pi.mcp.adapter-backed',
    ]);
    const lifecycle = rendered.diagnostics.find(
      ({ code }) => code === 'pi.capability.conditional-lifecycle',
    );
    expect(lifecycle?.message).toContain(
      'Terminal notifications establish task terminal status and wake the parent',
    );
    expect(lifecycle?.message).toContain(
      'do not provide result or acceptance evidence',
    );
    expect(lifecycle?.message).toContain(
      'cancellation acknowledgements alone do not establish termination',
    );
    const serialized = rendered.artifacts
      .map(({ content }) => String(content))
      .join('\n');
    const root = renderPiRootInstructions();
    expect(root).toContain('subagent_run({ agent, task');
    expect(root).toContain('subagent_cancel({ task_id })');
    expect(serialized).not.toContain('batch input:');
    expect(serialized).not.toContain('task store implementation');
  });
});
