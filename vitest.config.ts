import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["benchmarks/**"],
    benchmark: {
      include: ["benchmarks/**/*.bench.ts"],
    },
    globals: false,
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli/**"],
      reporter: ["text", "text-summary", "json", "lcov"],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85,
      },
    },
  },
});
