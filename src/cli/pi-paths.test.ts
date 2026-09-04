import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { resolvePiPaths } from './pi-paths';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('Pi paths', () => {
  test('resolves default Pi and XDG MCP roots without reading the real home', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-paths-'));
    roots.push(homeDir);
    const paths = resolvePiPaths({
      homeDir,
      cwd: join(homeDir, 'project'),
      env: { XDG_CONFIG_HOME: join(homeDir, 'xdg') },
    });
    expect(paths.piRoot).toBe(join(homeDir, '.pi', 'agent'));
    expect(paths.agentsRoot).toBe(join(homeDir, '.pi', 'agent', 'agents'));
    expect(paths.alternateAgentsRoot).toBe(
      join(homeDir, '.pi', 'agent', 'subagents'),
    );
    expect(paths.ownedSkillsRoot).toBe(join(homeDir, '.pi', 'agent', 'skills'));
    expect(paths.mcpConfigPath).toBe(join(homeDir, 'xdg', 'mcp', 'mcp.json'));
    expect(paths.projectAgentRoots).toEqual([
      join(homeDir, 'project', '.pi', 'agents'),
      join(homeDir, 'project', '.pi', 'subagents'),
    ]);
    expect(paths.skillsDestinationCompatible).toBe(true);
  });

  test('marks a custom Pi root incompatible with the canonical skills CLI destination', () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'thoth-pi-custom-'));
    roots.push(homeDir);
    const paths = resolvePiPaths({
      homeDir,
      env: { PI_CODING_AGENT_DIR: join(homeDir, 'custom-pi') },
    });
    expect(paths.customPiRoot).toBe(true);
    expect(paths.skillsDestinationCompatible).toBe(false);
  });
});
