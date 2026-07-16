import "server-only";
import { MongoClient, type Db, type Collection, type Document as MongoDocument } from "mongodb";

/**
 * Native MongoDB driver client. Replaces the Atlas Data API HTTP client
 * (lib/db/dataApiClient.ts, deleted) — MongoDB has since removed App
 * Services / Data API for new Atlas projects, so it's no longer an option
 * for this app regardless of the WebContainer-TCP concern that originally
 * motivated moving off Prisma. See MIGRATION_INVENTORY.md "Architecture
 * pivot" for why a raw TCP driver is actually fine here: DevPilot's own DB
 * calls (auth.ts, modules/*\/actions/*.ts) run in a real Next.js Node.js
 * server process, never inside the WebContainer sandbox — only the *user's*
 * own project runs there, and this module is never reachable from it.
 *
 * `import "server-only"` is the actual enforcement of that boundary: if this
 * module (or anything that imports it) is ever pulled into a Client
 * Component bundle, the Next.js build fails immediately instead of silently
 * shipping a MongoDB connection string to the browser.
 *
 * The method surface below (findOne/find/insertOne/.../deleteMany, taking a
 * collection name + plain filter/update objects) intentionally mirrors the
 * old Data API client 1:1, so every repository in lib/db/repositories/ and
 * every existing unit test needed zero logic changes — only the import path
 * and a few renamed types.
 */

export interface MongoConfig {
  /** Standard `mongodb+srv://...` (or `mongodb://...`) connection string. */
  uri: string;
  database: string;
  /** Injectable for tests — bypasses the real network connection entirely. */
  dbImpl?: Db;
}

export class DbError extends Error {
  readonly operation: string;
  readonly collection: string;
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(
    message: string,
    operation: string,
    collection: string,
    options: { cause?: unknown; retryable?: boolean } = {}
  ) {
    super(message);
    this.name = "DbError";
    this.operation = operation;
    this.collection = collection;
    this.cause = options.cause;
    this.retryable = options.retryable ?? false;
  }
}

export interface FindOptions {
  projection?: Record<string, 0 | 1>;
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
}

type Filter = Record<string, unknown>;
type Document = Record<string, unknown>;
type Update = Record<string, unknown>;

/**
 * Driver errors worth retrying: transient connectivity issues, not logic
 * errors (bad filter, duplicate key, etc.). Named-error-class checks avoid a
 * hard dependency on the exact error shape across driver versions.
 */
function isRetryableMongoError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (
    err.name === "MongoNetworkError" ||
    err.name === "MongoServerSelectionError" ||
    err.name === "MongoNetworkTimeoutError"
  ) {
    return true;
  }
  const withLabels = err as { hasErrorLabel?: (label: string) => boolean };
  if (typeof withLabels.hasErrorLabel === "function") {
    return (
      withLabels.hasErrorLabel("TransientTransactionError") ||
      withLabels.hasErrorLabel("RetryableWriteError")
    );
  }
  return false;
}

const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
};

function getConnectedClient(uri: string): Promise<MongoClient> {
  if (!globalForMongo._mongoClientPromise) {
    const client = new MongoClient(uri);
    globalForMongo._mongoClientPromise = client.connect();
  }
  return globalForMongo._mongoClientPromise;
}

async function getDb(config: MongoConfig): Promise<Db> {
  if (config.dbImpl) return config.dbImpl;
  const client = await getConnectedClient(config.uri);
  return client.db(config.database);
}

async function withCollection<T>(
  config: MongoConfig,
  collectionName: string,
  operation: string,
  fn: (collection: Collection<MongoDocument>) => Promise<T>
): Promise<T> {
  try {
    const db = await getDb(config);
    return await fn(db.collection(collectionName));
  } catch (err) {
    if (err instanceof DbError) throw err;
    throw new DbError(
      `MongoDB ${operation} on "${collectionName}" failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      operation,
      collectionName,
      { cause: err, retryable: isRetryableMongoError(err) }
    );
  }
}

export function createMongoDbClient(config: MongoConfig) {
  return {
    async findOne<T = Document>(
      collection: string,
      filter: Filter,
      options: FindOptions = {}
    ): Promise<T | null> {
      return withCollection(config, collection, "findOne", async (col) => {
        const doc = await col.findOne(filter, {
          projection: options.projection,
          sort: options.sort,
        });
        return (doc as T) ?? null;
      });
    },

    async find<T = Document>(
      collection: string,
      filter: Filter,
      options: FindOptions = {}
    ): Promise<T[]> {
      return withCollection(config, collection, "find", async (col) => {
        const docs = await col
          .find(filter, {
            projection: options.projection,
            sort: options.sort,
            skip: options.skip,
            limit: options.limit,
          })
          .toArray();
        return docs as T[];
      });
    },

    async insertOne(collection: string, document: Document): Promise<{ insertedId: string }> {
      return withCollection(config, collection, "insertOne", async (col) => {
        const result = await col.insertOne(document);
        return { insertedId: String(result.insertedId) };
      });
    },

    async insertMany(collection: string, documents: Document[]): Promise<{ insertedIds: string[] }> {
      if (documents.length === 0) return { insertedIds: [] };
      return withCollection(config, collection, "insertMany", async (col) => {
        const result = await col.insertMany(documents);
        return { insertedIds: Object.values(result.insertedIds).map(String) };
      });
    },

    async updateOne(
      collection: string,
      filter: Filter,
      update: Update,
      options: { upsert?: boolean } = {}
    ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId?: string }> {
      return withCollection(config, collection, "updateOne", async (col) => {
        const result = await col.updateOne(filter, update, { upsert: options.upsert });
        return {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          upsertedId: result.upsertedId ? String(result.upsertedId) : undefined,
        };
      });
    },

    async updateMany(
      collection: string,
      filter: Filter,
      update: Update
    ): Promise<{ matchedCount: number; modifiedCount: number }> {
      return withCollection(config, collection, "updateMany", async (col) => {
        const result = await col.updateMany(filter, update);
        return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
      });
    },

    async deleteOne(collection: string, filter: Filter): Promise<{ deletedCount: number }> {
      return withCollection(config, collection, "deleteOne", async (col) => {
        const result = await col.deleteOne(filter);
        return { deletedCount: result.deletedCount };
      });
    },

    async deleteMany(collection: string, filter: Filter): Promise<{ deletedCount: number }> {
      return withCollection(config, collection, "deleteMany", async (col) => {
        const result = await col.deleteMany(filter);
        return { deletedCount: result.deletedCount };
      });
    },

    /**
     * Schema/infra concern, not a per-request data operation — this app has
     * no automatic index provisioning (see MIGRATION_INVENTORY.md's
     * uniqueness-index gap, handled manually on Atlas today). Exposed here
     * only so a one-off setup script (e.g. scripts/ensure-checkpoint-indexes.ts)
     * can create indexes idempotently through the same DbClient surface,
     * rather than reaching for the raw mongodb driver directly.
     */
    async createIndex(
      collection: string,
      keys: Record<string, 1 | -1>,
      options: { expireAfterSeconds?: number; unique?: boolean; name?: string } = {}
    ): Promise<string> {
      return withCollection(config, collection, "createIndex", async (col) => col.createIndex(keys, options));
    },
  };
}

export type DbClient = ReturnType<typeof createMongoDbClient>;

/** Required env vars — see lib/db/env.ts for the startup validation that checks these are actually present. */
export function loadMongoConfigFromEnv(): MongoConfig {
  const uri = process.env.DATABASE_URL;
  const database = process.env.MONGODB_DATABASE;

  const missing = [!uri && "DATABASE_URL", !database && "MONGODB_DATABASE"].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing required MongoDB env vars: ${missing.join(", ")}`);
  }

  return { uri: uri!, database: database! };
}

let defaultClient: DbClient | undefined;

/** Lazily-built singleton using real env vars — only constructed on first actual use, so importing this module never throws in a test process that hasn't set the env vars. */
export function getMongoDbClient(): DbClient {
  if (!defaultClient) {
    defaultClient = createMongoDbClient(loadMongoConfigFromEnv());
  }
  return defaultClient;
}
