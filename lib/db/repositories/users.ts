import { getMongoDbClient, type DbClient } from "../mongoClient";
import { COLLECTIONS } from "../collections";
import { newId, UserCreateInputSchema, type User, type UserCreateInput, type Account } from "../schemas";
import { mapId, type WithMongoId } from "../mapId";
import { findAccountsByUserId } from "./accounts";
import { findPlaygroundsRawByUser, deletePlaygroundCascade } from "./playgrounds";
import { deleteStarMarksByUser } from "./starMarks";
import { deleteChatMessagesByUser } from "./chatMessages";

export async function findUserByEmail(
  email: string,
  client: DbClient = getMongoDbClient()
): Promise<User | null> {
  const doc = await client.findOne<WithMongoId<User>>(COLLECTIONS.User, { email });
  return doc ? mapId(doc) : null;
}

export async function findUserById(
  id: string,
  client: DbClient = getMongoDbClient()
): Promise<User | null> {
  const doc = await client.findOne<WithMongoId<User>>(COLLECTIONS.User, { _id: id });
  return doc ? mapId(doc) : null;
}

/** Replaces `db.user.findUnique({ where: { id }, include: { accounts: true } })`. */
export async function findUserByIdWithAccounts(
  id: string,
  client: DbClient = getMongoDbClient()
): Promise<(User & { accounts: Account[] }) | null> {
  const user = await findUserById(id, client);
  if (!user) return null;
  const accounts = await findAccountsByUserId(id, client);
  return { ...user, accounts };
}

export async function createUser(
  input: UserCreateInput,
  client: DbClient = getMongoDbClient()
): Promise<User> {
  const parsed = UserCreateInputSchema.parse(input);
  const now = new Date();
  const doc: WithMongoId<User> = {
    _id: newId(),
    name: parsed.name ?? null,
    email: parsed.email,
    image: parsed.image ?? null,
    role: parsed.role,
    createdAt: now,
    updatedAt: now,
  };
  await client.insertOne(COLLECTIONS.User, doc as unknown as Record<string, unknown>);
  return mapId(doc);
}

/**
 * Reimplements Prisma's `onDelete: Cascade` for User — Mongo has no native FK
 * cascade, and Prisma's MongoDB connector performed this at the
 * application/query-engine level, so removing Prisma removes it unless
 * rebuilt here. No call site in the app deletes a User today (see
 * MIGRATION_INVENTORY.md), so this exists for schema parity/future use.
 *
 * NOT atomic: Data API has no multi-document transaction support usable here,
 * so a crash partway through can leave a partial cascade (e.g. Playgrounds
 * deleted but ChatMessages not yet). Flagged for manual review per the
 * migration plan; acceptable today only because nothing calls this yet.
 */
export async function deleteUserCascade(
  id: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  const playgrounds = await findPlaygroundsRawByUser(id, client);
  for (const playground of playgrounds) {
    await deletePlaygroundCascade(playground.id, client);
  }

  await client.deleteMany(COLLECTIONS.Account, { userId: id });
  await deleteStarMarksByUser(id, client);
  await deleteChatMessagesByUser(id, client);
  await client.deleteOne(COLLECTIONS.User, { _id: id });
}
