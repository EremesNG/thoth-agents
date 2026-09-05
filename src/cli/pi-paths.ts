import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface PiPathOptions {
  homeDir?: string;
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
}

export interface PiPaths {
  homeDir: string;
  piRoot: string;
  defaultPiRoot: string;
  customPiRoot: boolean;
  skillsDestinationCompatible: boolean;
  appendSystemPath: string;
  agentsRoot: string;
  alternateAgentsRoot: string;
  ownedSkillsRoot: string;
  mcpConfigPath: string;
  projectAgentRoots: string[];
  projectMcpPaths: string[];
}

export function resolvePiPaths(options: PiPathOptions = {}): PiPaths {
  const env = options.env ?? process.env;
  const homeDir = resolve(
    options.homeDir ?? env.HOME ?? env.USERPROFILE ?? homedir(),
  );
  const defaultPiRoot = join(homeDir, '.pi', 'agent');
  const configured = env.PI_CODING_AGENT_DIR?.trim();
  const piRoot = configured ? resolve(configured) : defaultPiRoot;
  const cwd = resolve(options.cwd ?? process.cwd());
  const configRoot = env.XDG_CONFIG_HOME?.trim()
    ? resolve(env.XDG_CONFIG_HOME)
    : join(homeDir, '.config');
  return {
    homeDir,
    piRoot,
    defaultPiRoot,
    customPiRoot: piRoot !== defaultPiRoot,
    skillsDestinationCompatible: piRoot === defaultPiRoot,
    appendSystemPath: join(piRoot, 'APPEND_SYSTEM.md'),
    agentsRoot: join(piRoot, 'agents'),
    alternateAgentsRoot: join(piRoot, 'subagents'),
    ownedSkillsRoot: join(piRoot, 'skills'),
    mcpConfigPath: join(configRoot, 'mcp', 'mcp.json'),
    projectAgentRoots: [
      join(cwd, '.pi', 'agents'),
      join(cwd, '.pi', 'subagents'),
    ],
    projectMcpPaths: [join(cwd, '.mcp.json'), join(cwd, '.pi', 'mcp.json')],
  };
}
