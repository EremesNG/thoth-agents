import { describe, expect, test } from 'vitest';
import { PI_CAPABILITIES, piAdapter, renderPiRootInstructions } from './pi';

describe('Pi adapter', () => {
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
