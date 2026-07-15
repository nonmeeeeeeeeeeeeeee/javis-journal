import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the tsconfig "@/*" -> "./src/*" path alias for test runs.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // On-demand TS transform of the growing suite can spike a cold dynamic import() past the
    // stock 5s per-test timeout under CPU contention (e.g. the seed.ts import in
    // sticker-writes.test.ts). This is transform latency, not slow assertions — give every test
    // headroom so a saturated machine can't flake a green suite red.
    testTimeout: 20000,
    // Never scan git worktrees created by /parallel-plan agents under .claude/.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
