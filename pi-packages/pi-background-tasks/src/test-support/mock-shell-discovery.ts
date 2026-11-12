import { vi } from 'vitest';

// UI/output tests register tools, but do not test host shell discovery. The real
// registration probe can start PowerShell and wait up to 15 s per candidate.
// Keep launch-time resolution real (history tests also launch direct argv jobs).
// Shell discovery and registration caching have their own shell/powershell tests.
vi.mock('../shell.js', async (original) => ({
  ...await original<typeof import('../shell.js')>(),
  detectShells: (): import('../shell.js').ShellDetection => ({
    available: [{
      kind: 'none',
      executable: '',
      args: [],
      label: 'none (direct argv)',
    }],
    unavailable: {
      bash: 'Not probed in UI/output tests',
      powershell: 'Not probed in UI/output tests',
    },
  }),
}));
