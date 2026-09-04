import { claudeCodeAdapter } from './adapters/claude-code';
import { codexAdapter } from './adapters/codex';
import { opencodeAdapter } from './adapters/opencode';
import { piAdapter } from './adapters/pi';
import type {
  HarnessAdapter,
  HarnessId,
  HarnessResolutionResult,
} from './types';

const HARNESS_ADAPTERS = {
  opencode: opencodeAdapter,
  codex: codexAdapter,
  claude: claudeCodeAdapter,
  pi: piAdapter,
} as const satisfies Record<HarnessId, HarnessAdapter>;

export const DEFAULT_HARNESS: HarnessId = 'opencode';
export const SUPPORTED_HARNESSES = Object.keys(HARNESS_ADAPTERS) as HarnessId[];

export function isSupportedHarness(value: string): value is HarnessId {
  return value in HARNESS_ADAPTERS;
}

export function getHarnessAdapter(harness: HarnessId): HarnessAdapter {
  return HARNESS_ADAPTERS[harness];
}

export function resolveHarness(
  requestedHarness: string | undefined,
): HarnessResolutionResult {
  const harness = requestedHarness ?? DEFAULT_HARNESS;

  if (isSupportedHarness(harness)) {
    return {
      ok: true,
      harness,
      adapter: getHarnessAdapter(harness),
      artifacts: [],
      diagnostics: [],
    };
  }

  return {
    ok: false,
    harness,
    artifacts: [],
    diagnostics: [
      {
        severity: 'error',
        code: 'harness.unsupported',
        message: `Unsupported harness "${harness}". Supported harnesses: ${SUPPORTED_HARNESSES.join(', ')}.`,
        harness,
        requestedHarness: harness,
        supportedHarnesses: [...SUPPORTED_HARNESSES],
        fallback: 'none',
      },
    ],
  };
}
