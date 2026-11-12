import { vi } from 'vitest';

// UI/output tests register tools, but do not test host shell discovery. The real
// registration lookup is host-dependent even though it never probes versions.
// Keep launch-time resolution real (history tests also launch direct argv jobs).
// Shell discovery and launch validation have their own shell/powershell tests.
vi.mock('../shell.js', async (original) => ({
  ...await original<typeof import('../shell.js')>(),
  detectShells: (): import('../shell.js').ShellRegistrationDetection => ({
    available: [{
      kind: 'none',
      executable: '',
      unverified: true,
      label: 'none (direct argv)',
    }],
    unavailable: {
      bash: 'Not probed in UI/output tests',
      powershell: 'Not probed in UI/output tests',
    },
  }),
}));
