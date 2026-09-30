import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/helpers/portable-spawn.ts"],
    // contract the auth-heavy suites rely on: no module/state leakage across files
    isolate: true,
    include: ["tests/**/*.test.ts"],
  },
});
