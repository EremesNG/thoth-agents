import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Windows tree verification starts real hidden CIM helpers and loaded CI
    // runners slow cold extension imports; allow verified settlement everywhere.
    testTimeout: 15_000,
    ...(process.platform === "win32" ? { maxWorkers: 2 } : {}),
    // Private TMPDIR (and so task registry) per test file (#324).
    globalSetup: ["./src/test-support/isolate-registry-root.ts"],
    setupFiles: ["./src/test-support/isolate-registry.ts"],
  },
});
