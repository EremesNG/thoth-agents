import {
  createBashToolDefinition,
  createLocalBashOperations,
  createLocalPowerShellOperations,
  createPowerShellToolDefinition,
  type ExtensionAPI,
  getPowerShellConfig,
  getShellConfig,
} from '@earendil-works/pi-coding-agent';
import {
  publishToolDefinitions,
  type ToolDefinitionHandle,
} from '@thoth-agents/pi-core';
import {
  JobLauncherUnavailable,
  launchInJob,
} from '@thoth-agents/pi-core/windows-job';
import { createJobOperations } from './job-operations.ts';

// Not exported by the SDK; pinned against its current PowerShell operations.
const UTF8_OUTPUT_PREFIX =
  'try { [Console]::OutputEncoding=[System.Text.Encoding]::UTF8 } catch {}\n';
const WARNING =
  'Windows shell containment is unavailable; using Pi default execution (descendants may survive).';

export function createContainedOperations(
  kind: 'bash' | 'powershell',
  warn: () => void,
  launch = launchInJob,
) {
  return createJobOperations({
    resolveShell: kind === 'bash' ? getShellConfig : getPowerShellConfig,
    fallback:
      kind === 'bash'
        ? createLocalBashOperations()
        : createLocalPowerShellOperations(),
    prefix: kind === 'powershell' ? UTF8_OUTPUT_PREFIX : undefined,
    warn,
    launch,
  });
}

async function warmLauncher(): Promise<void> {
  const job = await launchInJob({
    file: process.execPath,
    args: ['-e', ''],
    cwd: process.cwd(),
    env: process.env,
  });
  job.stdout.resume();
  job.stderr.resume();
  job.stdin.end();
  try {
    await job.exited;
  } finally {
    try {
      await job.terminate(5_000);
    } finally {
      await job.release();
    }
  }
}

export default function containedShell(pi: ExtensionAPI): void {
  if (process.platform !== 'win32') return;
  let warn = () => {
    console.warn(WARNING);
  };
  const definitions = [
    createBashToolDefinition(process.cwd(), {
      operations: createContainedOperations('bash', () => warn()),
    }),
    createPowerShellToolDefinition(process.cwd(), {
      operations: createContainedOperations('powershell', () => warn()),
    }),
  ];
  for (const definition of definitions) pi.registerTool(definition);
  let publication: ToolDefinitionHandle | undefined;
  let generation = 0;
  pi.on('session_start', (_event, ctx) => {
    const session = ++generation;
    let warned = false;
    const sessionWarn = () => {
      if (warned || session !== generation) return;
      warned = true;
      if (ctx.hasUI) ctx.ui.notify(WARNING, 'warning');
      else console.warn(WARNING);
    };
    warn = sessionWarn;
    if (ctx.hasUI) publication ??= publishToolDefinitions(definitions);
    // Cold PowerShell/Add-Type acquisition must not block session startup.
    void warmLauncher().catch((error) => {
      if (error instanceof JobLauncherUnavailable) sessionWarn();
      else console.warn('Contained shell launcher warm-up failed:', error);
    });
  });
  pi.on('session_shutdown', () => {
    ++generation;
    publication?.withdraw();
    publication = undefined;
  });
}
