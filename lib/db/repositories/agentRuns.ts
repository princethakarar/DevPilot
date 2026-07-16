import { getMongoDbClient, type DbClient } from "../mongoClient";
import { COLLECTIONS } from "../collections";
import {
  newId,
  AgentRunCreateInputSchema,
  type AgentRun,
  type AgentRunCreateInput,
  type AgentRunLogEntry,
  type AgentRunStatus,
} from "../schemas";
import { mapId, type WithMongoId } from "../mapId";

export async function createAgentRun(
  input: AgentRunCreateInput,
  client: DbClient = getMongoDbClient()
): Promise<AgentRun> {
  const parsed = AgentRunCreateInputSchema.parse(input);
  const now = new Date();
  const doc: WithMongoId<AgentRun> = {
    _id: newId(),
    playgroundId: parsed.playgroundId,
    userId: parsed.userId,
    task: parsed.task,
    status: "running",
    log: [],
    iterationCount: 0,
    toolCallCount: 0,
    approxTokens: 0,
    stopRequested: false,
    checkpointBeforeId: null,
    checkpointAfterId: null,
    summary: null,
    blockedReason: null,
    startedAt: now,
    endedAt: null,
  };
  await client.insertOne(COLLECTIONS.AgentRun, doc as unknown as Record<string, unknown>);
  return mapId(doc);
}

export async function findAgentRunById(
  id: string,
  client: DbClient = getMongoDbClient()
): Promise<AgentRun | null> {
  const doc = await client.findOne<WithMongoId<AgentRun>>(COLLECTIONS.AgentRun, { _id: id });
  return doc ? mapId(doc) : null;
}

/** Runs currently in-flight for a user (concurrency cap) or a specific project (one run at a time per project). */
export async function findActiveAgentRuns(
  filter: { userId?: string; playgroundId?: string },
  client: DbClient = getMongoDbClient()
): Promise<AgentRun[]> {
  const docs = await client.find<WithMongoId<AgentRun>>(COLLECTIONS.AgentRun, {
    ...filter,
    status: "running",
  });
  return docs.map(mapId);
}

/** Runs started by this user in the last `sinceMs` milliseconds, for the hourly rate cap. */
export async function countAgentRunsSince(
  userId: string,
  since: Date,
  client: DbClient = getMongoDbClient()
): Promise<number> {
  const docs = await client.find<WithMongoId<AgentRun>>(COLLECTIONS.AgentRun, {
    userId,
    startedAt: { $gte: since },
  });
  return docs.length;
}

export async function appendAgentRunLog(
  id: string,
  entry: AgentRunLogEntry,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.updateOne(COLLECTIONS.AgentRun, { _id: id }, { $push: { log: entry } } as unknown as Record<string, unknown>);
}

export async function incrementAgentRunCounters(
  id: string,
  delta: { iterationCount?: number; toolCallCount?: number; approxTokens?: number },
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.updateOne(COLLECTIONS.AgentRun, { _id: id }, { $inc: delta } as unknown as Record<string, unknown>);
}

export async function setAgentRunStopRequested(
  id: string,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.updateOne(COLLECTIONS.AgentRun, { _id: id }, { $set: { stopRequested: true } });
}

export async function setAgentRunCheckpointBefore(
  id: string,
  checkpointId: string | null,
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.updateOne(COLLECTIONS.AgentRun, { _id: id }, { $set: { checkpointBeforeId: checkpointId } });
}

export async function finishAgentRun(
  id: string,
  data: {
    status: Exclude<AgentRunStatus, "running">;
    summary?: string | null;
    blockedReason?: string | null;
    checkpointAfterId?: string | null;
  },
  client: DbClient = getMongoDbClient()
): Promise<void> {
  await client.updateOne(
    COLLECTIONS.AgentRun,
    { _id: id },
    {
      $set: {
        status: data.status,
        summary: data.summary ?? null,
        blockedReason: data.blockedReason ?? null,
        checkpointAfterId: data.checkpointAfterId ?? null,
        endedAt: new Date(),
      },
    }
  );
}
