import { defineConfig } from "vitest/config";

// Unit tests for the pure logic in src/lib (selectors, permission matrix,
// engine mapping, data-shaping). These are the functions that decide what the
// UI shows — a regression here is a silent wrong-number bug a build won't catch.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
    globals: true,
  },
});
