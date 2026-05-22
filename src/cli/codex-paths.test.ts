import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { resolveCodexTargets } from './codex-paths';

describe('Codex path resolution', () => {
  test('resolves user targets through Codex home and excludes orchestrator TOML', () => {
    const targets = resolveCodexTargets({
      scope: 'user',
      projectRoot: '/repo',
      homeDir: '/home/alice',
      codexHome: '/custom/.codex',
    });

    expect(targets.configPath).toBe(join('/custom/.codex', 'config.toml'));
    expect(targets.rootInstructionsPath).toBe(
      join('/custom/.codex', 'AGENTS.md'),
    );
    expect(targets.roleAgentPaths.map((target) => target.role)).toEqual([
      'explorer',
      'librarian',
      'oracle',
      'designer',
      'quick',
      'deep',
    ]);
    expect(targets.roleAgentPaths.map((target) => target.path)).not.toContain(
      join('/custom/.codex', 'agents', 'thoth-agents-orchestrator.toml'),
    );
    expect(targets.managedModelsPath).toBe(
      join('/custom/.codex', 'agents', '.thoth-agents-managed-models.json'),
    );
    expect(targets.personalPluginRoot).toBe(
      join('/custom/.codex', 'plugins', 'thoth-agents'),
    );
    expect(targets.personalMarketplacePath).toBe(
      join('/home/alice', '.agents', 'plugins', 'marketplace.json'),
    );
  });

  test('resolves project-scope role and skill targets inside the project', () => {
    const targets = resolveCodexTargets({
      scope: 'project',
      projectRoot: '/repo',
      homeDir: '/home/alice',
    });

    expect(targets.roleAgentPaths[0].path).toBe(
      join('/repo', '.codex', 'agents', 'thoth-agents-explorer.toml'),
    );
    expect(targets.managedModelsPath).toBe(
      join(
        '/home/alice',
        '.codex',
        'agents',
        '.thoth-agents-managed-models.json',
      ),
    );
    expect(targets.skillsDir).toBe(join('/repo', '.agents', 'skills'));
    expect(targets.rootInstructionsPath).toBe(
      join('/home/alice', '.codex', 'AGENTS.md'),
    );
  });
});
