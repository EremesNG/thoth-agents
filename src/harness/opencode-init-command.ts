import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface OpenCodeInitCommandOptions {
  projectRoot: string;
  packageRoot: string;
}

export interface OpenCodeInitCommand {
  template: string;
  description: string;
  agent: 'orchestrator';
  subtask: false;
}

export function createOpenCodeInitCommand({
  projectRoot,
  packageRoot,
}: OpenCodeInitCommandOptions): OpenCodeInitCommand {
  const skillPath = join(packageRoot, 'skills', 'thoth-init', 'SKILL.md');
  const scriptPath = join(
    packageRoot,
    'skills',
    'thoth-init',
    'scripts',
    'init.mjs',
  );
  if (!existsSync(skillPath) || !existsSync(scriptPath)) {
    throw new Error('The bundled thoth-init skill is incomplete.');
  }
  const contract = readFileSync(skillPath, 'utf8');

  return {
    description: 'Initialize thoth-agents project SDD governance',
    agent: 'orchestrator',
    subtask: false,
    template: `Initialize this project now using the bundled thoth-init skill.

The operation must stay project-scoped, idempotent, and offline. Run:

node "${scriptPath}" --project "${projectRoot}" --harness opencode --json

Inspect the JSON result, report created and preserved files, and do not download
skills or invoke the thoth-agents CLI.

Bundled skill contract:

${contract}`,
  };
}
