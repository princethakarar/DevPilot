import { getMongoDbClient } from "../lib/db/mongoClient";
import { COLLECTIONS } from "../lib/db/collections";

async function main() {
  const playgrounds = await getMongoDbClient().find<{ _id: string; title: string }>(
    COLLECTIONS.Playground,
    {},
    { projection: { title: 1 } }
  );
  console.log("Playgrounds:", playgrounds.map((p) => ({ id: p._id, title: p.title })));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
