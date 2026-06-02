import { describe, expect, test } from 'vitest';
import type { HarnessArtifact } from '../types';
import { renderClaudeCodePluginPackage } from './claude-code-plugin-package';

function component(path: string, content: string): HarnessArtifact {
  return {
    harness: 'claude',
    kind: 'agent-config',
    path,
    content,
  };
}

describe('renderClaudeCodePluginPackage', () => {
  test('emits an ordered manifest plus provenance and sorted components', () => {
    const result = renderClaudeCodePluginPackage({
      manifest: {
        name: 'thoth-agents',
        version: '1.2.3',
        description: 'pack',
        author: { name: 'thoth-agents' },
      },
      componentArtifacts: [
        component('.claude-plugin/agents/quick.md', 'q'),
        component('.claude-plugin/agents/deep.md', 'd'),
      ],
    });

    const manifest = result.artifacts.find((a) =>
      a.path.endsWith('plugin.json'),
    );
    expect(manifest?.content).toBe(
      `${JSON.stringify(
        {
          name: 'thoth-agents',
          version: '1.2.3',
          description: 'pack',
          author: { name: 'thoth-agents' },
        },
        null,
        2,
      )}\n`,
    );

    // Components are sorted by path: deep before quick.
    const componentPaths = result.artifacts
      .filter((a) => a.kind === 'agent-config')
      .map((a) => a.path);
    expect(componentPaths).toEqual([
      '.claude-plugin/agents/deep.md',
      '.claude-plugin/agents/quick.md',
    ]);

    const provenance = result.artifacts.find((a) =>
      a.path.endsWith('.thoth-agents-plugin-assets.json'),
    );
    expect(provenance).toBeDefined();
    const parsed = JSON.parse(String(provenance?.content)) as {
      assets: { path: string; sha256: string }[];
    };
    expect(parsed.assets.map((entry) => entry.path)).toEqual([
      '.claude-plugin/agents/deep.md',
      '.claude-plugin/agents/quick.md',
    ]);
    expect(parsed.assets[0].sha256).toMatch(/^sha256:/);
    expect(result.diagnostics).toEqual([]);
  });
});
