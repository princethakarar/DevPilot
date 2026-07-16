import { getMongoDbClient, type DbClient } from "../mongoClient";
import { COLLECTIONS } from "../collections";
import {
  newId,
  ProjectCheckpointCreateInputSchema,
  type ProjectCheckpoint,
  type ProjectCheckpointCreateInput,
} from "../schemas";
import { mapId, type WithMongoId } from "../mapId";

export async function insertProjectCheckpoint(
  input: ProjectCheckpointCreateInput,
  client: DbClient = getMongoDbClient()
): Promise<ProjectCheckpoint> {
  const parsed = ProjectCheckpointCreateInputSchema.parse(input);
  const doc: WithMongoId<ProjectCheckpoint> = { _id: newId(), ...parsed, createdAt: new Date() };
  await client.insertOne(COLLECTIONS.ProjectCheckpoint, doc as unknown as Record<string, unknown>);
  return mapId(doc);
}

/**
 * Scoped by both checkpointId AND projectId — a checkpoint can only ever be
 * restored within the project it belongs to, even if an id were somehow
 * guessed/reused. Returns null for both "genuinely expired (TTL swept)" and
 * "never existed" — callers treat those identically, same as the prior
 * Redis design's "missing = expired" philosophy.
 */
export async function findProjectCheckpoint(
  projectId: string,
  checkpointId: string,
  client: DbClient = getMongoDbClient()
): Promise<ProjectCheckpoint | null> {
  const doc = await client.findOne<WithMongoId<ProjectCheckpoint>>(COLLECTIONS.ProjectCheckpoint, {
    _id: checkpointId,
    projectId,
  });
  return doc ? mapId(doc) : null;
}

/**
 * Newest-first, lightweight — projected to exclude `files`, which is the
 * only potentially large field, so the checkpoint history list never pulls
 * full file content over the wire just to render labels/timestamps.
 */
export async function findProjectCheckpointSummaries(
  projectId: string,
  client: DbClient = getMongoDbClient()
): Promise<ProjectCheckpoint[]> {
  const docs = await client.find<WithMongoId<ProjectCheckpoint>>(
    COLLECTIONS.ProjectCheckpoint,
    { projectId },
    { projection: { label: 1, reason: 1, createdAt: 1 }, sort: { createdAt: -1 } }
  );
  return docs.map(mapId);
}
