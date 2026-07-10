import { defineConfig } from "vitest/config";
import path from "path";
import "dotenv/config";

/**
 * Separate config so `npm test` (vitest.config.ts) never touches the network.
 * Integration tests hit a real MongoDB cluster and are opt-in only — see
 * lib/db/__tests__/integration/mongoClient.integration.test.ts.
 *
 * `dotenv/config` here (not needed by vitest.config.ts) loads `.env` so
 * `npm run test:integration` picks up DATABASE_URL / MONGODB_DATABASE the
 * same way `next dev` does, without requiring the user to export them
 * manually. Real CI runs (.github/workflows/integration.yml) set them as
 * actual environment variables instead, so this is a no-op there.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    exclude: ["node_modules", "vibecode-starters/**"],
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "lib/db/__tests__/server-only-shim.ts"),
    },
  },
});
