import { homedir } from 'node:os';
import { join } from 'node:path';

export type CodexInstallScope = 'project' | 'user';
export type CodexRoleName =
  | 'explorer'
  | 'librarian'
  | 'oracle'
  | 'designer'
  | 'quick'
  | 'deep';

export const CODEX_ROLE_NAMES = [
  'explorer',
  'librarian',
  'oracle',
  'designer',
  'quick',
  'deep',
] as const satisfies readonly CodexRoleName[];

export interface CodexTargetResolverOptions {
  scope: CodexInstallScope;
  projectRoot: string;
  homeDir?: string;
  codexHome?: string;
}

export interface CodexResolvedTargets {
  scope: CodexInstallScope;
  codexHome: string;
  configPath: string;
  rootInstructionsPath: string;
  roleAgentPaths: { role: CodexRoleName; path: string }[];
  skillsDir: string;
  packageRoot: string;
  personalPluginRoot: string;
  personalMarketplacePath: string;
}

export function getCodexHome(
  options: { homeDir?: string; codexHome?: string } = {},
): string {
  const explicit = options.codexHome ?? process.env.CODEX_HOME?.trim();
  return explicit || join(options.homeDir ?? homedir(), '.codex');
}

export function resolveCodexTargets(
  options: CodexTargetResolverOptions,
): CodexResolvedTargets {
  const codexHome = getCodexHome(options);
  const agentsDir =
    options.scope === 'project'
      ? join(options.projectRoot, '.codex', 'agents')
      : join(codexHome, 'agents');

  return {
    scope: options.scope,
    codexHome,
    configPath: join(codexHome, 'config.toml'),
    rootInstructionsPath: join(codexHome, 'AGENTS.md'),
    roleAgentPaths: CODEX_ROLE_NAMES.map((role) => ({
      role,
      path: join(agentsDir, `thoth-agents-${role}.toml`),
    })),
    skillsDir:
      options.scope === 'project'
        ? join(options.projectRoot, '.agents', 'skills')
        : join(options.homeDir ?? homedir(), '.agents', 'skills'),
    packageRoot: join(options.projectRoot, '.codex-plugin'),
    personalPluginRoot: join(codexHome, 'plugins', 'thoth-agents'),
    personalMarketplacePath: join(
      options.homeDir ?? homedir(),
      '.agents',
      'plugins',
      'marketplace.json',
    ),
  };
}
