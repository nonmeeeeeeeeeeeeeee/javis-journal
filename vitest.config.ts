import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Never scan git worktrees created by /parallel-plan agents under .claude/.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
