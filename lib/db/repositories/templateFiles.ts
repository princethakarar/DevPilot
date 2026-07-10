import { getMongoDbClient, type DbClient } from "../mongoClient";
import { COLLECTIONS } from "../collections";
import { newId, TemplateFileCreateInputSchema, type TemplateFile, type TemplateFileCreateInput } from "../schemas";
import { mapId, type WithMongoId } from "../mapId";

export async function findTemplateFilesByPlayground(
  playgroundId: string,
  client: DbClient = getMongoDbClient()
): Promise<TemplateFile[]> {
  const docs = await client.find<WithMongoId<TemplateFile>>(COLLECTIONS.TemplateFile, { playgroundId });
  return docs.map(mapId);
}

export async function findTemplateFileByPlayground(
  playgroundId: string,
  client: DbClient = getMongoDbClient()
): Promise<TemplateFile | null> {
  const doc = await client.findOne<WithMongoId<TemplateFile>>(COLLECTIONS.TemplateFile, { playgroundId });
  return doc ? mapId(doc) : null;
}

export async function createTemplateFile(
  input: TemplateFileCreateInput,
  client: DbClient = getMongoDbClient()
): Promise<TemplateFile> {
  const parsed = TemplateFileCreateInputSchema.parse(input);
  const now = new Date();
  const doc: WithMongoId<TemplateFile> = { _id: newId(), ...parsed, createdAt: now, updatedAt: now };
  await client.insertOne(COLLECTIONS.TemplateFile, doc as unknown as Record<string, unknown>);
  return mapId(doc);
}

export async function updateTemplateFileContent(
  playgroundId: string,
  content: unknown,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.updateOne(
    COLLECTIONS.TemplateFile,
    { playgroundId },
    { $set: { content, updatedAt: new Date() } }
  );
}

/** Replaces `db.templateFile.upsert({ where: { playgroundId }, update, create })`. */
export async function upsertTemplateFileForPlayground(
  playgroundId: string,
  content: unknown,
  client: DbClient = getMongoDbClient()
): Promise<TemplateFile> {
  const existing = await findTemplateFileByPlayground(playgroundId, client);
  if (existing) {
    await updateTemplateFileContent(playgroundId, content, client);
    return { ...existing, content, updatedAt: new Date() };
  }
  return createTemplateFile({ playgroundId, content }, client);
}

export async function deleteTemplateFilesByPlayground(
  playgroundId: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.deleteMany(COLLECTIONS.TemplateFile, { playgroundId });
}
