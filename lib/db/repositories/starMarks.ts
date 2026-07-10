import { getMongoDbClient, type DbClient } from "../mongoClient";
import { COLLECTIONS } from "../collections";
import { newId, StarMarkCreateInputSchema, type StarMark, type StarMarkCreateInput } from "../schemas";
import { mapId, type WithMongoId } from "../mapId";

export async function createStarMark(
  input: StarMarkCreateInput,
  client: DbClient = getMongoDbClient()
): Promise<StarMark> {
  const parsed = StarMarkCreateInputSchema.parse(input);
  const doc: WithMongoId<StarMark> = { _id: newId(), ...parsed, createdAt: new Date() };
  await client.insertOne(COLLECTIONS.StarMark, doc as unknown as Record<string, unknown>);
  return mapId(doc);
}

/** Replaces `where: { userId_playgroundId: { userId, playgroundId } }` (Prisma's compound-unique key name). */
export async function deleteStarMark(
  userId: string,
  playgroundId: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.deleteOne(COLLECTIONS.StarMark, { userId, playgroundId });
}

export async function findStarMarksByUserAndPlaygrounds(
  userId: string,
  playgroundIds: string[],
  client: DbClient = getMongoDbClient()
): Promise<Pick<StarMark, "playgroundId" | "isMarked">[]> {
  if (playgroundIds.length === 0) return [];
  return client.find<Pick<StarMark, "playgroundId" | "isMarked">>(
    COLLECTIONS.StarMark,
    { userId, playgroundId: { $in: playgroundIds } },
    { projection: { playgroundId: 1, isMarked: 1 } }
  );
}

export async function deleteStarMarksByUser(
  userId: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.deleteMany(COLLECTIONS.StarMark, { userId });
}

export async function deleteStarMarksByPlayground(
  playgroundId: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.deleteMany(COLLECTIONS.StarMark, { playgroundId });
}
