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
      config: { agents: { deep: { model } } } as PluginConfig,
    });
    const deep = rendered.artifacts.find(
      ({ path }) => path === 'agents/thoth-deep.md',
    );
    expect(deep?.content).toContain(`model: "${expected}"`);
    expect(deep?.content).not.toContain('\nthinking:');
    expect(deep?.content).not.toContain('\neffort:');
  });

  test('assigns the shared specialist model and effort preset through the Pi provider', () => {
    const expected = {
      explorer: ['gpt-6-luna', 'low'],
      librarian: ['gpt-6-luna', 'high'],
      oracle: ['gpt-6-astra', 'medium'],
      designer: ['gpt-6-sol', 'medium'],
      quick: ['gpt-6-luna', 'medium'],
      deep: ['gpt-6-sol', 'medium'],
    };
    const rendered = piAdapter.render({ projectRoot: process.cwd() });
    for (const [role, [model, effort]] of Object.entries(expected)) {
      const artifact = rendered.artifacts.find(
        ({ path }) => path === `agents/thoth-${role}.md`,
      );
      expect(artifact?.content).toContain(`model: "openai-codex/${model}"`);
      expect(artifact?.content).toContain(`thinking: "${effort}"`);
      expect(artifact?.content).not.toContain('\neffort:');
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
    expect(root).toContain(
      'A missing tool, no UI or a pending dialog never counts as an attempt',
    );
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

  test('activates delegation lazily and uses native single/background lifecycle vocabulary', () => {
    const root = renderPiRootInstructions();
    expect(root).toContain('subagents_enable({})');
    expect(root).toContain('next model request');
    expect(root).toContain('subagent({ agent, task');
    expect(root).toContain('context: "fresh"');
    expect(root).toContain('"profile"');
    expect(root).toContain('async: true');
    expect(root).toContain('async: false');
    expect(root).toContain('workflowScript');
    expect(root).toContain('runs.all');
    expect(root).toContain('bg_wait({ id })');
    expect(root).toContain('action: "status"');
    expect(root).toContain('action: "stop"');
    expect(root).toContain('action: "steer"');
    expect(root).toContain('mode: "steer" | "follow_up" | "auto"');
    expect(root).not.toMatch(
      /subagent_(?:run|status|result|cancel|list_tasks)/,
    );
    expect(root).not.toContain('parallel/chain/tasks');
  });

  test('waits for native terminal notifications instead of polling background tasks', () => {
    const root = renderPiRootInstructions();
    const shaping = root.match(/<task-shaping>([\s\S]*?)<\/task-shaping>/)?.[1];
    expect(shaping).toContain('notify the parent on completion');
    expect(shaping).toContain('Do not sleep or poll status merely to wait');
    expect(shaping).not.toContain('then use `subagent_status');
    expect(shaping).toContain('terminal completion notification');
  });

  test('makes background mode explicit when required and keeps simple jobs simple', () => {
    const root = renderPiRootInstructions();
    expect(root).toContain('overridable `asyncByDefault`');
    expect(root).toContain('do not assume background execution');
    expect(root).toContain('especially for librarian/MCP-backed work');
    expect(root).toContain('simple single-agent jobs');
    expect(root).not.toContain('mode="background"');
    expect(root).not.toContain('background=true');
  });

  test('lists only namespaced specialist identities in runtime delegation guidance', () => {
    const root = renderPiRootInstructions();
    expect(root).toContain(
      'thoth-explorer, thoth-librarian, thoth-oracle, thoth-designer, thoth-quick, or thoth-deep',
    );
    expect(root).not.toContain(
      'agent`: explorer, librarian, oracle, designer, quick, or deep',
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
    const serialized = rendered.artifacts
      .map(({ content }) => String(content))
      .join('\n');
    const root = renderPiRootInstructions();
    expect(root).toContain('subagent({ agent, task');
    expect(root).toContain('action: "stop"');
    expect(serialized).not.toContain('batch input:');
    expect(serialized).not.toContain('task store implementation');
  });
});
