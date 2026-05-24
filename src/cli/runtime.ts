export interface RuntimeContext {
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  stderrIsTTY?: boolean;
  env: Record<string, string | undefined>;
}

interface ProcessLike {
  stdin?: { isTTY?: boolean };
  stdout?: { isTTY?: boolean };
  stderr?: { isTTY?: boolean };
  env?: Record<string, string | undefined>;
}

const automationEnvironmentKeys = [
  'CI',
  'CONTINUOUS_INTEGRATION',
  'BUILD_NUMBER',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'TF_BUILD',
  'TEAMCITY_VERSION',
];

function isTruthyEnvValue(value: string | undefined): boolean {
  if (value === undefined || value === '') return false;
  const normalized = value.toLowerCase();
  return normalized !== '0' && normalized !== 'false';
}

export function detectRuntimeContext(
  processLike: ProcessLike = process,
): RuntimeContext {
  return {
    stdinIsTTY: processLike.stdin?.isTTY === true,
    stdoutIsTTY: processLike.stdout?.isTTY === true,
    stderrIsTTY: processLike.stderr?.isTTY === true,
    env: { ...(processLike.env ?? {}) },
  };
}

export function isInteractiveRuntime(context: RuntimeContext): boolean {
  if (!context.stdinIsTTY || !context.stdoutIsTTY) return false;
  if (context.env.TERM?.toLowerCase() === 'dumb') return false;

  return !automationEnvironmentKeys.some((key) =>
    isTruthyEnvValue(context.env[key]),
  );
}
