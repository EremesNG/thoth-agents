import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackageRoot } from './cli/package-root';
import { syncPiSpecialists } from './cli/pi-resources';
import { renderPiRootInstructions } from './harness/adapters/pi';
import { PI_ROOT_END, PI_ROOT_START } from './harness/writers/pi-agent';

type PiHandler = (event: Record<string, unknown>, context?: unknown) => unknown;

export interface PiExtensionApi {
  on(event: 'before_agent_start' | 'session_start', handler: PiHandler): void;
}
export interface PiExtensionOptions {
  packageRoot?: string;
  piRoot?: string;
}

function withoutRootBlock(prompt: string): string {
  const start = prompt.indexOf(PI_ROOT_START);
  const end = prompt.indexOf(PI_ROOT_END, start + PI_ROOT_START.length);
  if (start < 0 || end < 0) return prompt.trimEnd();
  return `${prompt.slice(0, start)}${prompt.slice(end + PI_ROOT_END.length)}`.trimEnd();
}

export function injectPiRoot(systemPrompt: string): string {
  const hostPrompt = withoutRootBlock(systemPrompt);
  return [hostPrompt, renderPiRootInstructions()].filter(Boolean).join('\n\n');
}

export default function thothAgentsPiExtension(
  pi: PiExtensionApi,
  options: PiExtensionOptions = {},
): void {
  pi.on('before_agent_start', (event) => ({
    systemPrompt: injectPiRoot(
      typeof event.systemPrompt === 'string' ? event.systemPrompt : '',
    ),
  }));
  pi.on('session_start', () => {
    try {
      const packageRoot =
        options.packageRoot ??
        findPackageRoot(dirname(fileURLToPath(import.meta.url)));
      if (!packageRoot) return;
      syncPiSpecialists({
        packageRoot,
        piRoot:
          options.piRoot ??
          process.env.PI_CODING_AGENT_DIR?.trim() ??
          join(homedir(), '.pi', 'agent'),
      });
    } catch {
      // A direct package install may be degraded; never reject a valid Pi session.
    }
  });
}
