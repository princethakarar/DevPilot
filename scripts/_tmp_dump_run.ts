import "dotenv/config";
import { MongoClient } from "mongodb";

const RUN_ID = process.argv[2];

async function main() {
  const uri = process.env.DATABASE_URL!;
  const dbName = process.env.MONGODB_DATABASE!;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const run = await db.collection("AgentRun").findOne({ _id: RUN_ID as any });
  if (!run) {
    console.log("not found");
    await client.close();
    return;
  }
  console.log(`RUN ${RUN_ID} | status=${run.status} | task="${run.task}"`);
  console.log(`started=${run.startedAt} ended=${run.endedAt}`);
  console.log(`iterations=${run.iterationCount} toolCalls=${run.toolCallCount} tokens=${run.approxTokens}`);
  console.log(`summary=${run.summary}`);
  console.log(`blockedReason=${run.blockedReason}`);
  console.log(`--- LOG (${run.log?.length ?? 0} entries) ---`);
  let prevTs: number | null = null;
  for (const entry of run.log ?? []) {
    const ts = new Date(entry.ts).getTime();
    const delta = prevTs !== null ? ((ts - prevTs) / 1000).toFixed(1) : "0.0";
    prevTs = ts;
    console.log(`[+${delta}s] ${entry.type.toUpperCase()}: ${String(entry.message).slice(0, 300)}`);
  }
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
