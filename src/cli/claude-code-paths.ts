import { homedir } from 'node:os';
import { join } from 'node:path';

export type ClaudeCodeInstallScope = 'project' | 'user';

export type ClaudeCodeRoleName =
  | 'explorer'
  | 'librarian'
  | 'oracle'
  | 'designer'
  | 'quick'
  | 'deep';

export const CLAUDE_CODE_ROLE_NAMES = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'quick',
  'deep',
] as const satisfies readonly ClaudeCodeRoleName[];

export interface ClaudeCodeTargetResolverOptions {
  scope: ClaudeCodeInstallScope;
  projectRoot: string;
  homeDir?: string;
}

export interface ClaudeCodeResolvedTargets {
  scope: ClaudeCodeInstallScope;
  pluginRoot: string;
  pluginManifestPath: string;
  agentPaths: { role: ClaudeCodeRoleName; path: string }[];
  mcpPath: string;
  hooksPath: string;
  skillsDir: string;
  managedModelsPath: string;
}

/**
 * Resolve the on-disk Claude Code plugin package targets. Claude Code plugins
 * installed as a "skills-directory plugin": a folder under a Claude Code skills
 * directory (`~/.claude/skills/<name>` for user scope, `<project>/.claude/skills/<name>`
 * for project scope) that contains `.claude-plugin/plugin.json` is auto-loaded
 * as `<name>@skills-dir` on the next session — no marketplace, no install step,
 * discovered in place rather than copied to the `~/.claude/plugins/cache`.
 * Only `plugin.json` sits in `.claude-plugin/`; components are plugin-root siblings.
 */
export function resolveClaudeCodeTargets(
  options: ClaudeCodeTargetResolverOptions,
): ClaudeCodeResolvedTargets {
  const home = options.homeDir ?? homedir();
  const pluginRoot =
    options.scope === 'project'
      ? join(options.projectRoot, '.claude', 'skills', 'thoth-agents')
      : join(home, '.claude', 'skills', 'thoth-agents');

  return {
    scope: options.scope,
    pluginRoot,
    pluginManifestPath: join(pluginRoot, '.claude-plugin', 'plugin.json'),
    agentPaths: CLAUDE_CODE_ROLE_NAMES.map((role) => ({
      role,
      path: join(pluginRoot, 'agents', `${role}.md`),
    })),
    mcpPath: join(pluginRoot, '.mcp.json'),
    hooksPath: join(pluginRoot, 'hooks', 'hooks.json'),
    skillsDir: join(pluginRoot, 'skills'),
    managedModelsPath: join(pluginRoot, '.thoth-agents-managed-models.json'),
  };
}
