import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Windows tree verification starts real hidden CIM helpers. Bound contention
    // and allow multi-command integration cases to include verified settlement.
    ...(process.platform === "win32" ? { maxWorkers: 2, testTimeout: 15_000 } : {}),
    // Private TMPDIR (and so task registry) per test file (#324).
    globalSetup: ["./src/test-support/isolate-registry-root.ts"],
    setupFiles: ["./src/test-support/isolate-registry.ts"],
  },
});
