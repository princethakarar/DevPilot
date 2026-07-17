import "dotenv/config";
import { MongoClient } from "mongodb";

async function main() {
  const uri = process.env.DATABASE_URL!;
  const dbName = process.env.MONGODB_DATABASE!;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const runs = await db.collection("AgentRun").find({}).toArray();
  console.log(`Total agent runs in DB: ${runs.length}`);
  const sorted = runs.sort((a: any, b: any) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  for (const r of sorted.slice(0, 20)) {
    console.log(
      `- ${r._id} | status=${r.status} | task="${String(r.task).slice(0, 70)}" | iterations=${r.iterationCount} toolCalls=${r.toolCallCount} tokens=${r.approxTokens} | started=${r.startedAt} ended=${r.endedAt} | logEntries=${r.log?.length ?? 0}`
    );
  }
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
