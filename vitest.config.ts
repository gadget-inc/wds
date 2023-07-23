import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["spec/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
  },
});
