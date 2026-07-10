import { describe, it, expect, afterAll } from "vitest";
import { MongoClient } from "mongodb";
import { loadMongoConfigFromEnv, type MongoConfig } from "../../mongoClient";
import { createUser, findUserByEmail, deleteUserCascade } from "../../repositories/users";
import { createPlaygroundWithTemplateFile, findPlaygroundWithTemplateFiles, deletePlaygroundCascade } from "../../repositories/playgrounds";

/**
 * Opt-in only. `npm test` never runs this file (see vitest.config.ts's
 * exclude). Run explicitly with `npm run test:integration` after setting
 * DATABASE_URL / MONGODB_DATABASE to a real MongoDB connection string.
 *
 * NOT RUN OR VERIFIED as part of this migration — I (the agent that wrote
 * this) do not run arbitrary network operations against a user's real
 * database without being asked to. This is scaffolding only; run
 * `npm run test:integration` yourself and confirm it passes before treating
 * the migration as fully verified end to end. See
 * lib/db/MIGRATION_INVENTORY.md "Architecture pivot" for what has and
 * hasn't been independently confirmed.
 *
 * Uses whatever database DATABASE_URL points at. If that's a shared or
 * production database, consider pointing this at a disposable test database
 * first — this suite creates and deletes real documents (clearly marked
 * with a `__integration-test__` prefix and cleaned up in afterAll, but a
 * crash mid-run could leave orphaned rows behind).
 */

let config: MongoConfig | null = null;
try {
  config = loadMongoConfigFromEnv();
} catch {
  config = null;
}

const TEST_MARKER = `__integration-test__${Date.now()}-${Math.random().toString(36).slice(2)}`;

function withWrongPassword(uri: string): string {
  // mongodb+srv://user:pass@host/db?... -> mongodb+srv://user:definitely-wrong-password@host/db?...
  return uri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:definitely-wrong-password@");
}

describe.skipIf(!config)("MongoDB native driver integration (real network)", () => {
  const createdUserIds: string[] = [];
  const createdPlaygroundIds: string[] = [];

  afterAll(async () => {
    // Best-effort cleanup even if an assertion above failed mid-test — never
    // leave test data behind in a real cluster.
    for (const id of createdPlaygroundIds) {
      await deletePlaygroundCascade(id).catch(() => {});
    }
    for (const id of createdUserIds) {
      await deleteUserCascade(id).catch(() => {});
    }
  });

  it("round-trips a User through createUser -> findUserByEmail with the `.id` shape intact", async () => {
    const email = `${TEST_MARKER}@example.com`;
    const created = await createUser({ email, name: "Integration Test User" });
    createdUserIds.push(created.id);

    expect(created.id).toBeTruthy();
    expect(created.email).toBe(email);
    expect(created.role).toBe("USER");

    const found = await findUserByEmail(email);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect((found as any)._id).toBeUndefined();
  });

  it("round-trips a Playground + TemplateFile relation through create -> find -> cascade delete", async () => {
    const email = `${TEST_MARKER}-owner@example.com`;
    const owner = await createUser({ email });
    createdUserIds.push(owner.id);

    const playground = await createPlaygroundWithTemplateFile(
      { title: `${TEST_MARKER}-playground`, userId: owner.id },
      JSON.stringify({ folderName: "root", items: [] })
    );
    createdPlaygroundIds.push(playground.id);

    const withFiles = await findPlaygroundWithTemplateFiles(playground.id);
    expect(withFiles).not.toBeNull();
    expect(withFiles!.templateFiles).toHaveLength(1);

    await deletePlaygroundCascade(playground.id);
    createdPlaygroundIds.splice(createdPlaygroundIds.indexOf(playground.id), 1);

    const afterDelete = await findPlaygroundWithTemplateFiles(playground.id);
    expect(afterDelete).toBeNull();
  });

  it("rejects when connecting with a deliberately wrong password (regression guard: connection failures must surface, not hang silently — the concern the original ticket described, restated for a TCP driver instead of HTTPS)", async () => {
    const badUri = withWrongPassword(config!.uri);
    expect(badUri).not.toBe(config!.uri);

    const badClient = new MongoClient(badUri, { serverSelectionTimeoutMS: 5000 });
    await expect(badClient.connect()).rejects.toThrow();
    await badClient.close().catch(() => {});
  });
});

if (!config) {
  // eslint-disable-next-line no-console
  console.warn(
    "[integration tests] Skipped — DATABASE_URL/MONGODB_DATABASE are not set. " +
      "Run `npm run test:integration` with a real MongoDB connection string to execute this suite."
  );
}
