/**
 * One-off setup script — this app has no automatic index provisioning (see
 * lib/db/MIGRATION_INVENTORY.md's uniqueness-index gap, handled manually on
 * Atlas today). The checkpoint TTL index can't be created any other way
 * from application code (it's an infra concern, not a per-request query),
 * so run this once against your database after deploying the checkpoint
 * migration, and again any time CHECKPOINT_TTL_SECONDS changes (createIndex
 * is idempotent for identical options, but changing expireAfterSeconds on
 * an existing TTL index requires collMod, not a second createIndex call —
 * this script handles that too).
 *
 * Usage: npx tsx scripts/ensure-checkpoint-indexes.ts
 */
import "dotenv/config";
import { MongoClient } from "mongodb";
import { COLLECTIONS } from "../lib/db/collections";
// From constants.ts, not store.ts — store.ts pulls in "server-only", which
// throws unconditionally outside Next's own webpack build (this script runs
// under plain `tsx`). See constants.ts's doc comment.
import { CHECKPOINT_TTL_SECONDS } from "../lib/checkpoint/constants";

async function main() {
  const uri = process.env.DATABASE_URL;
  const dbName = process.env.MONGODB_DATABASE;
  if (!uri || !dbName) {
    throw new Error("Missing DATABASE_URL / MONGODB_DATABASE in the environment.");
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const col = client.db(dbName).collection(COLLECTIONS.ProjectCheckpoint);

    // Fast newest-first listing per project (findProjectCheckpointSummaries).
    await col.createIndex({ projectId: 1, createdAt: -1 }, { name: "projectId_createdAt" });
    console.log("Ensured index: projectId_createdAt");

    // TTL expiry — the actual safety-net lifetime. MongoDB's TTL background
    // monitor runs roughly every 60s, so documents may remain queryable up
    // to ~60s past this nominal expiry; that's accepted, not worked around.
    const existing = await col.indexes();
    const ttlIndex = existing.find((idx) => idx.name === "createdAt_ttl");
    if (!ttlIndex) {
      await col.createIndex({ createdAt: 1 }, { name: "createdAt_ttl", expireAfterSeconds: CHECKPOINT_TTL_SECONDS });
      console.log(`Created TTL index: createdAt_ttl (expireAfterSeconds=${CHECKPOINT_TTL_SECONDS})`);
    } else if (ttlIndex.expireAfterSeconds !== CHECKPOINT_TTL_SECONDS) {
      // Changing an existing TTL index's expiry requires collMod, not createIndex.
      await client.db(dbName).command({
        collMod: COLLECTIONS.ProjectCheckpoint,
        index: { name: "createdAt_ttl", expireAfterSeconds: CHECKPOINT_TTL_SECONDS },
      });
      console.log(`Updated TTL index expireAfterSeconds: ${ttlIndex.expireAfterSeconds} -> ${CHECKPOINT_TTL_SECONDS}`);
    } else {
      console.log("TTL index already up to date.");
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
