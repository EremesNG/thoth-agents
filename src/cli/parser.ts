import { isInteractiveRuntime, type RuntimeContext } from './runtime';
import type {
  BooleanArg,
  CliOperationCommand,
  CliParseResult,
  GenerateArgs,
  InstallArgs,
  OperationArgs,
  OperationHarnessArg,
} from './types';

const defaultRuntimeContext: RuntimeContext = {
  stdinIsTTY: false,
  stdoutIsTTY: false,
  env: {},
};

const operationCommands = new Set<CliOperationCommand>([
  'status',
  'list',
  'update',
  'sync',
  'model',
]);

function parseBooleanArg(name: string, value: string): BooleanArg {
  if (value !== 'yes' && value !== 'no') {
    throw new Error(`${name} must be yes or no.`);
  }
  return value;
}

function parseOperationHarness(value: string): OperationHarnessArg {
  if (value !== 'opencode' && value !== 'codex' && value !== 'claude') {
    throw new Error(
      `Unsupported operation harness: ${value}. Supported harnesses: opencode, codex, claude.`,
    );
  }
  return value;
}

function parseRoleModel(value: string): { role: string; model: string } {
  const separator = value.includes('=') ? '=' : ':';
  const [role, ...modelParts] = value.split(separator);
  const model = modelParts.join(separator);
  if (!role || !model) {
    throw new Error(
      '--role-model must use role=model or role:model, for example --role-model=deep=openai/gpt-5.4-mini.',
    );
  }
  return { role, model };
}

export function parseOperationArgs(args: string[]): OperationArgs {
  const result: OperationArgs = { roles: [] };
  let pendingRole: string | undefined;
  let pendingProvider: string | undefined;

  function pushPendingRole(model: string): void {
    if (!pendingRole) {
      throw new Error(
        '--model requires --role, or pass --role-model=role=model.',
      );
    }
    result.roles.push({
      role: pendingRole,
      model,
      provider: pendingProvider,
    });
    pendingRole = undefined;
    pendingProvider = undefined;
  }

  for (const arg of args) {
    if (arg.startsWith('--harness=')) {
      result.harness = parseOperationHarness(arg.split('=')[1] ?? '');
    } else if (arg.startsWith('--agent=')) {
      result.harness = parseOperationHarness(arg.split('=')[1] ?? '');
    } else if (arg === '--all') {
      result.all = true;
    } else if (arg === '--apply') {
      result.apply = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg.startsWith('--role=')) {
      pendingRole = arg.split('=')[1] ?? '';
      if (!pendingRole) throw new Error('--role requires a value.');
    } else if (arg.startsWith('--provider=')) {
      pendingProvider = arg.split('=')[1] ?? '';
      if (!pendingProvider) throw new Error('--provider requires a value.');
    } else if (arg.startsWith('--model=')) {
      pushPendingRole(arg.split('=')[1] ?? '');
    } else if (arg.startsWith('--role-model=')) {
      const parsed = parseRoleModel(arg.slice('--role-model='.length));
      result.roles.push({
        ...parsed,
        provider: pendingProvider,
      });
      pendingProvider = undefined;
    } else if (arg === '-h' || arg === '--help') {
      throw new Error('help');
    } else {
      throw new Error(`Unsupported operation option: ${arg}`);
    }
  }

  if (pendingRole) {
    throw new Error('--role requires a matching --model.');
  }

  if (result.all && result.harness) {
    throw new Error('--all cannot be combined with --harness or --agent.');
  }

  return result;
}

export function parseInstallArgs(args: string[]): InstallArgs {
  const result: InstallArgs = {
    tui: true,
    agent: 'opencode',
  };

  for (const arg of args) {
    if (arg === '--no-tui') {
      result.tui = false;
    } else if (arg.startsWith('--tmux=')) {
      result.tmux = parseBooleanArg('--tmux', arg.split('=')[1] ?? '');
    } else if (arg.startsWith('--skills=')) {
      result.skills = parseBooleanArg('--skills', arg.split('=')[1] ?? '');
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--reset') {
      result.reset = true;
    } else if (arg.startsWith('--agent=')) {
      const agent = arg.split('=')[1];
      if (agent !== 'opencode' && agent !== 'codex' && agent !== 'claude') {
        throw new Error(
          `Unsupported install agent: ${agent}. Supported agents: opencode, codex, claude.`,
        );
      }
      result.agent = agent;
    } else if (arg === '-h' || arg === '--help') {
      throw new Error('help');
    }
  }

  return result;
}

export function parseGenerateArgs(args: string[]): CliParseResult {
  const result: Partial<GenerateArgs> = {};

  for (const arg of args) {
    if (arg.startsWith('--harness=')) {
      const harness = arg.split('=')[1];
      if (harness !== 'codex' && harness !== 'claude') {
        return {
          command: 'error',
          message: `Unsupported generate harness: ${harness}. Supported harnesses: codex, claude.`,
        };
      }
      result.harness = harness;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg.startsWith('--output-root=')) {
      result.outputRoot = arg.split('=')[1];
    }
  }

  if (result.harness !== 'codex' && result.harness !== 'claude') {
    return {
      command: 'error',
      message: 'Generation requires --harness=codex or --harness=claude.',
    };
  }

  return {
    command: 'generate',
    generateArgs: {
      harness: result.harness,
      dryRun: result.dryRun,
      outputRoot: result.outputRoot,
    },
  };
}

export function parseCliArgs(
  args: string[],
  runtimeContext: RuntimeContext = defaultRuntimeContext,
): CliParseResult {
  if (args.length === 0) {
    if (isInteractiveRuntime(runtimeContext)) {
      return { command: 'tui' };
    }
    return {
      command: 'install',
      installArgs: { tui: false, agent: 'opencode' },
    };
  }

  if (args[0] === 'install') {
    try {
      return {
        command: 'install',
        installArgs: parseInstallArgs(args.slice(1)),
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'help') {
        return { command: 'help' };
      }
      return {
        command: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (args[0] === 'generate') {
    return parseGenerateArgs(args.slice(1));
  }

  if (args[0] === '-h' || args[0] === '--help') {
    return { command: 'help' };
  }

  if (operationCommands.has(args[0] as CliOperationCommand)) {
    try {
      return {
        command: args[0] as CliOperationCommand,
        operationArgs: parseOperationArgs(args.slice(1)),
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'help') {
        return { command: 'help' };
      }
      return {
        command: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { command: 'error', message: `Unknown command: ${args[0]}` };
}
