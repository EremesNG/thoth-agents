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
    ['inherit', 'default'],
  ])('preserves explicit model configuration %j without imposing preset effort', (model, expected) => {
    const rendered = piAdapter.render({
      projectRoot: process.cwd(),
      config: { agents: { deep: { model } } } as PluginConfig,
    });
    const deep = rendered.artifacts.find(
      ({ path }) => path === 'agents/thoth-deep.md',
    );
    expect(deep?.content).toContain(`model: "${expected}"`);
    expect(deep?.content).toContain('effort: "default"');
  });

  test('assigns the shared specialist model and effort preset through the Pi provider', () => {
    const expected = {
      explorer: ['gpt-5.6-luna', 'low'],
      librarian: ['gpt-5.6-luna', 'high'],
      oracle: ['gpt-5.6-sol', 'high'],
      designer: ['gpt-5.6-sol', 'medium'],
      quick: ['gpt-5.6-luna', 'low'],
      deep: ['gpt-5.6-sol', 'medium'],
    };
    const rendered = piAdapter.render({ projectRoot: process.cwd() });
    for (const [role, [model, effort]] of Object.entries(expected)) {
      const artifact = rendered.artifacts.find(
        ({ path }) => path === `agents/thoth-${role}.md`,
      );
      expect(artifact?.content).toContain(`model: "openai-codex/${model}"`);
      expect(artifact?.content).toContain(`effort: "${effort}"`);
    }
  });

  test('keeps question dialogs and session progress root-owned', () => {
    const root = renderPiRootInstructions();
    expect(root).toContain(
      'Use `todo` only when the work genuinely has multiple dependent steps.',
    );
    expect(root).toContain('ask_user_question');
    expect(root).toContain('one to four questions');
    expect(root).toContain('two to four options');
    expect(root).toContain(
      'Cancellation, partial answers, a missing tool, or no UI',
    );
    expect(root).not.toContain('Use `subagent_status` only when the work');
    const children = piAdapter.render({ projectRoot: process.cwd() }).artifacts;
    for (const child of children) {
      expect(child.content).toContain(
        'Do not delegate further or call `todo`; root owns progress.',
      );
      expect(child.content).toContain(
        'escalate the unresolved question to the root',
      );
      expect(child.content).not.toContain('Use `ask_user_question`');
      expect(child.content).not.toContain('`undefined`');
    }
  });

  test('documents general web tool prerequisites and truthful failures', () => {
    const root = renderPiRootInstructions();
    expect(root).toContain('web_search');
    expect(root).toContain('web_fetch');
    expect(root).toContain('configured search provider');
    expect(root).toContain('untrusted data');
    expect(root).toContain('report the limitation');
    const librarian = piAdapter
      .render({ projectRoot: process.cwd() })
      .artifacts.find(({ path }) => path === 'agents/thoth-librarian.md');
    expect(librarian?.content).toContain('web_search');
    expect(librarian?.content).toContain('web_fetch');
  });

  test('waits for automatic terminal notifications instead of polling background tasks', () => {
    const root = renderPiRootInstructions();
    const shaping = root.match(/<task-shaping>([\s\S]*?)<\/task-shaping>/)?.[1];
    expect(shaping).toContain('automatic completion notification');
    expect(shaping).toContain(
      'Do not sleep, poll status, or fetch results merely to wait',
    );
    expect(shaping).not.toContain('then use `subagent_status');
    expect(shaping).toContain('terminal completion notification');
  });

  test('uses the installed single-agent tool names and explicit background mode', () => {
    const root = renderPiRootInstructions();
    expect(root).toContain('mode="background"');
    expect(root).toContain('Omit `mode` unless the user explicitly requests');
    expect(root).toContain('subagent_list_tasks');
    expect(root).not.toContain('background=true');
    expect(root).not.toMatch(/\bsubagent_list\b/);
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
    expect(root).toContain('subagent_run');
    expect(root).toContain('subagent_cancel');
    expect(serialized).not.toContain('batch input:');
    expect(serialized).not.toContain('task store implementation');
  });
});
