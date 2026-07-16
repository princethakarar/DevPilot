import { getMongoDbClient, type DbClient, type FindOptions } from "../mongoClient";
import { COLLECTIONS } from "../collections";
import { newId, PlaygroundCreateInputSchema, type Playground, type PlaygroundCreateInput, type User, type StarMark } from "../schemas";
import { mapId, type WithMongoId } from "../mapId";
import { findTemplateFilesByPlayground, createTemplateFile, deleteTemplateFilesByPlayground } from "./templateFiles";
import { findStarMarksByUserAndPlaygrounds, deleteStarMarksByPlayground } from "./starMarks";
import { deleteEnvVarsByPlayground } from "./playgroundEnvVars";

export async function findPlaygroundById(
  id: string,
  options: FindOptions = {},
  client: DbClient = getMongoDbClient()
): Promise<Playground | null> {
  const doc = await client.findOne<WithMongoId<Playground>>(COLLECTIONS.Playground, { _id: id }, options);
  return doc ? mapId(doc) : null;
}

/** Raw findMany by owner, no relations — internal helper for cascade deletes. */
export async function findPlaygroundsRawByUser(
  userId: string,
  client: DbClient = getMongoDbClient()
): Promise<Playground[]> {
  const docs = await client.find<WithMongoId<Playground>>(COLLECTIONS.Playground, { userId });
  return docs.map(mapId);
}

export async function findPlaygroundByUserAndTitle(
  userId: string,
  title: string,
  client: DbClient = getMongoDbClient()
): Promise<Playground | null> {
  const doc = await client.findOne<WithMongoId<Playground>>(COLLECTIONS.Playground, { userId, title });
  return doc ? mapId(doc) : null;
}

/**
 * Replaces `getPlaygroundById`'s original
 * `select: { title, githubRepo, githubBranch, templateFiles: { select: { content } } } }`
 * — a *projected* relation read, not the full document.
 */
export async function findPlaygroundSummaryWithTemplateFiles(
  id: string,
  client: DbClient = getMongoDbClient()
): Promise<Pick<Playground, "title" | "githubRepo" | "githubBranch" | "githubBaseContent" | "envFilePath"> & { templateFiles: { content: unknown }[] } | null> {
  const playground = await findPlaygroundById(
    id,
    { projection: { title: 1, githubRepo: 1, githubBranch: 1, githubBaseContent: 1, envFilePath: 1 } },
    client
  );
  if (!playground) return null;
  const templateFiles = await findTemplateFilesByPlayground(id, client);
  return {
    title: playground.title,
    githubRepo: playground.githubRepo,
    githubBranch: playground.githubBranch,
    // Null here (repo linked, never pushed/reset) is the signal the Source
    // Control panel uses to show "Retry Initial Push" instead of the normal
    // commit/push UI — see initialPushPending in source-control-panel.tsx.
    githubBaseContent: playground.githubBaseContent ?? null,
    envFilePath: playground.envFilePath ?? null,
    templateFiles: templateFiles.map((f) => ({ content: f.content })),
  };
}

/**
 * Replaces the three identical `db.playground.findUnique({ include: { templateFiles: { select: { content } } } })`
 * calls in commit.ts — full playground document plus the templateFiles relation.
 */
export async function findPlaygroundWithTemplateFiles(
  id: string,
  client: DbClient = getMongoDbClient()
): Promise<(Playground & { templateFiles: { content: unknown }[] }) | null> {
  const playground = await findPlaygroundById(id, {}, client);
  if (!playground) return null;
  const templateFiles = await findTemplateFilesByPlayground(id, client);
  return { ...playground, templateFiles: templateFiles.map((f) => ({ content: f.content })) };
}

/**
 * Replaces `getAllPlaygroundForUser`'s
 * `include: { user: true, Starmark: { where: { userId }, select: { isMarked } } }`.
 * Note the original queries the *owner's own* Starmark rows on their own
 * playgrounds — self-referential but preserved exactly as the original
 * behaved, not redesigned.
 */
export async function findPlaygroundsForUserWithOwnerAndStar(
  userId: string,
  client: DbClient = getMongoDbClient()
): Promise<(Playground & { user: User; Starmark: Pick<StarMark, "isMarked">[] })[]> {
  const playgrounds = await findPlaygroundsRawByUser(userId, client);
  if (playgrounds.length === 0) return [];

  // A Playground's `userId` is a required relation (matches Prisma's original
  // non-optional `user` include) — the owner is guaranteed to exist.
  const userDoc = await client.findOne<WithMongoId<User>>(COLLECTIONS.User, { _id: userId });
  if (!userDoc) throw new Error(`findPlaygroundsForUserWithOwnerAndStar: owner ${userId} not found`);
  const user = mapId(userDoc);
  const starMarks = await findStarMarksByUserAndPlaygrounds(
    userId,
    playgrounds.map((p) => p.id),
    client
  );
  const starMarkByPlayground = new Map(starMarks.map((s) => [s.playgroundId, s]));

  return playgrounds.map((p) => ({
    ...p,
    user,
    Starmark: starMarkByPlayground.has(p.id) ? [{ isMarked: starMarkByPlayground.get(p.id)!.isMarked }] : [],
  }));
}

export async function createPlayground(
  input: PlaygroundCreateInput,
  client: DbClient = getMongoDbClient()
): Promise<Playground> {
  const parsed = PlaygroundCreateInputSchema.parse(input);
  const now = new Date();
  const doc: WithMongoId<Playground> = {
    _id: newId(),
    title: parsed.title,
    description: parsed.description ?? null,
    template: parsed.template,
    githubRepo: parsed.githubRepo ?? null,
    githubBranch: parsed.githubBranch ?? null,
    githubBaseContent: parsed.githubBaseContent ?? null,
    envFilePath: parsed.envFilePath ?? null,
    userId: parsed.userId,
    createdAt: now,
    updatedAt: now,
  };
  await client.insertOne(COLLECTIONS.Playground, doc as unknown as Record<string, unknown>);
  return mapId(doc);
}

/** Replaces github.ts's nested `create: { templateFiles: { create: { content } } }`. */
export async function createPlaygroundWithTemplateFile(
  input: PlaygroundCreateInput,
  content: unknown,
  client: DbClient = getMongoDbClient()
): Promise<Playground> {
  const playground = await createPlayground(input, client);
  await createTemplateFile({ playgroundId: playground.id, content }, client);
  return playground;
}

export async function updatePlaygroundGithubBaseContent(
  id: string,
  githubBaseContent: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.updateOne(COLLECTIONS.Playground, { _id: id }, { $set: { githubBaseContent, updatedAt: new Date() } });
}

/**
 * Remembers which folder the project's ".env" lives in, since saveTemplateData
 * strips the file out of the persisted tree (see PlaygroundEnvVar) — without
 * this, a reload has no way to know the file used to live in a subdirectory
 * and always re-injects it at the tree root.
 */
/**
 * Links a newly-created GitHub repo to a template-originated playground.
 * Deliberately does NOT touch githubBaseContent — leaving it null means the
 * next commitChangesToGithub() diff naturally treats every current file as
 * "added", which is exactly what the first push (or a retry after a failed
 * first push) needs, with no separate bootstrap-content bookkeeping.
 */
export async function updatePlaygroundGithubRepo(
  id: string,
  githubRepo: string,
  githubBranch: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.updateOne(COLLECTIONS.Playground, { _id: id }, { $set: { githubRepo, githubBranch, updatedAt: new Date() } });
}

/**
 * Unlinks a GitHub repo from a playground (repo deleted/renamed on GitHub, or
 * user chose "Create New Repository" to replace a dead link). Only clears the
 * GitHub-metadata fields — never touches templateFiles/envVars, so the
 * project's local files are completely unaffected by unlinking/relinking.
 * Clearing githubBaseContent alongside the repo fields is deliberate: a future
 * relink must treat every current file as "added" again (a fresh initial
 * push), never diff against the old repo's stale baseline.
 */
export async function unlinkPlaygroundGithubRepo(
  id: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.updateOne(
    COLLECTIONS.Playground,
    { _id: id },
    { $set: { githubRepo: null, githubBranch: null, githubBaseContent: null, updatedAt: new Date() } }
  );
}

export async function updatePlaygroundEnvFilePath(
  id: string,
  envFilePath: string[] | null,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.updateOne(COLLECTIONS.Playground, { _id: id }, { $set: { envFilePath, updatedAt: new Date() } });
}

export async function updatePlayground(
  id: string,
  data: Partial<Pick<Playground, "title" | "description">>,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.updateOne(COLLECTIONS.Playground, { _id: id }, { $set: { ...data, updatedAt: new Date() } });
}

/**
 * Reimplements Prisma's `onDelete: Cascade` for Playground (StarMark,
 * TemplateFile, PlaygroundEnvVar all reference playgroundId). NOT atomic —
 * see MIGRATION_INVENTORY.md; a crash partway through can leave orphaned
 * rows, flagged for manual review same as the original ticket's transaction
 * concern.
 */
export async function deletePlaygroundCascade(
  id: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await deleteStarMarksByPlayground(id, client);
  await deleteTemplateFilesByPlayground(id, client);
  await deleteEnvVarsByPlayground(id, client);
  await client.deleteOne(COLLECTIONS.Playground, { _id: id });
}
