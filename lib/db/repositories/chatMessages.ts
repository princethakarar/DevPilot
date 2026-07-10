import { getMongoDbClient, type DbClient } from "../mongoClient";
import { COLLECTIONS } from "../collections";
import { newId, ChatMessageCreateInputSchema, type ChatMessage, type ChatMessageCreateInput } from "../schemas";
import { mapId, type WithMongoId } from "../mapId";

/**
 * No call site anywhere in the app references `db.chatMessage.*` (the AI chat
 * feature keeps history in React state only) — see MIGRATION_INVENTORY.md.
 * Built for schema parity; nothing currently calls these.
 */
export async function createChatMessage(
  input: ChatMessageCreateInput,
  client: DbClient = getMongoDbClient()
): Promise<ChatMessage> {
  const parsed = ChatMessageCreateInputSchema.parse(input);
  const doc: WithMongoId<ChatMessage> = { _id: newId(), ...parsed, createdAt: new Date() };
  await client.insertOne(COLLECTIONS.ChatMessage, doc as unknown as Record<string, unknown>);
  return mapId(doc);
}

export async function findChatMessagesByUser(
  userId: string,
  client: DbClient = getMongoDbClient()
): Promise<ChatMessage[]> {
  const docs = await client.find<WithMongoId<ChatMessage>>(COLLECTIONS.ChatMessage, { userId });
  return docs.map(mapId);
}

export async function deleteChatMessagesByUser(
  userId: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.deleteMany(COLLECTIONS.ChatMessage, { userId });
}
