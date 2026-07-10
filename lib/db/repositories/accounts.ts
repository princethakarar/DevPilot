import { getMongoDbClient, type DbClient } from "../mongoClient";
import { COLLECTIONS } from "../collections";
import { newId, AccountCreateInputSchema, type Account, type AccountCreateInput } from "../schemas";
import { mapId, type WithMongoId } from "../mapId";
import type { FindOptions } from "../mongoClient";

export async function findAccountByProviderAccountId(
  provider: string,
  providerAccountId: string,
  client: DbClient = getMongoDbClient()
): Promise<Account | null> {
  const doc = await client.findOne<WithMongoId<Account>>(COLLECTIONS.Account, { provider, providerAccountId });
  return doc ? mapId(doc) : null;
}

/** findFirst by userId only, no provider filter — matches getAccountByUserId's original Prisma call. */
export async function findAccountByUserId(
  userId: string,
  client: DbClient = getMongoDbClient()
): Promise<Account | null> {
  const doc = await client.findOne<WithMongoId<Account>>(COLLECTIONS.Account, { userId });
  return doc ? mapId(doc) : null;
}

export async function findAccountByUserIdAndProvider(
  userId: string,
  provider: string,
  options: FindOptions = {},
  client: DbClient = getMongoDbClient()
): Promise<Account | null> {
  const doc = await client.findOne<WithMongoId<Account>>(COLLECTIONS.Account, { userId, provider }, options);
  return doc ? mapId(doc) : null;
}

export async function findAccountsByUserId(
  userId: string,
  client: DbClient = getMongoDbClient()
): Promise<Account[]> {
  const docs = await client.find<WithMongoId<Account>>(COLLECTIONS.Account, { userId });
  return docs.map(mapId);
}

export async function createAccount(
  input: AccountCreateInput,
  client: DbClient = getMongoDbClient()
): Promise<Account> {
  const parsed = AccountCreateInputSchema.parse(input);
  const doc: WithMongoId<Account> = {
    _id: newId(),
    userId: parsed.userId,
    type: parsed.type,
    provider: parsed.provider,
    providerAccountId: parsed.providerAccountId,
    refreshToken: parsed.refreshToken ?? null,
    accessToken: parsed.accessToken ?? null,
    expiresAt: parsed.expiresAt ?? null,
    tokenType: parsed.tokenType ?? null,
    scope: parsed.scope ?? null,
    idToken: parsed.idToken ?? null,
    sessionState: parsed.sessionState ?? null,
  };
  await client.insertOne(COLLECTIONS.Account, doc as unknown as Record<string, unknown>);
  return mapId(doc);
}

export async function deleteAccountById(
  id: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.deleteOne(COLLECTIONS.Account, { _id: id });
}
