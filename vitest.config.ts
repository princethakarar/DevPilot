import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules", "vibecode-starters/**", "**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Next.js's webpack build aliases this away for server contexts; under
      // plain Node (vitest) it always throws, so shim it here. See
      // lib/db/__tests__/server-only-shim.ts.
      "server-only": path.resolve(__dirname, "lib/db/__tests__/server-only-shim.ts"),
    },
  },
});
