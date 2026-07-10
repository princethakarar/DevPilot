import { getMongoDbClient, type DbClient } from "../mongoClient";
import { COLLECTIONS } from "../collections";
import { newId, type PlaygroundEnvVar } from "../schemas";

export async function findEnvVarsByPlayground(
  playgroundId: string,
  client: DbClient = getMongoDbClient()
): Promise<Pick<PlaygroundEnvVar, "key" | "value">[]> {
  return client.find<Pick<PlaygroundEnvVar, "key" | "value">>(
    COLLECTIONS.PlaygroundEnvVar,
    { playgroundId },
    { projection: { key: 1, value: 1 } }
  );
}

/** Replaces the deleteMany-then-createMany pair in setPlaygroundEnvVars. Not atomic — see MIGRATION_INVENTORY.md transaction note. */
export async function replaceEnvVarsForPlayground(
  playgroundId: string,
  vars: { key: string; value: string }[],
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.deleteMany(COLLECTIONS.PlaygroundEnvVar, { playgroundId });
  if (vars.length === 0) return;
  const now = new Date();
  const documents = vars.map((v) => ({
    _id: newId(),
    playgroundId,
    key: v.key,
    value: v.value,
    createdAt: now,
    updatedAt: now,
  }));
  await client.insertMany(COLLECTIONS.PlaygroundEnvVar, documents);
}

export async function deleteEnvVarsByPlayground(
  playgroundId: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.deleteMany(COLLECTIONS.PlaygroundEnvVar, { playgroundId });
}
