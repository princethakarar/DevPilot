import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Db } from "mongodb";
import { createMongoDbClient, DbError, loadMongoConfigFromEnv, type MongoConfig } from "../mongoClient";

/**
 * `mongoClient.ts` takes an injectable `dbImpl` (mirroring the old Data API
 * client's injectable `fetchImpl`) specifically so these tests never open a
 * real network connection — see the `dbImpl` branch in `getDb()`.
 */
function fakeCollection(overrides: Record<string, any> = {}) {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    insertOne: vi.fn().mockResolvedValue({ insertedId: "generated-id" }),
    insertMany: vi.fn().mockResolvedValue({ insertedIds: {} }),
    updateOne: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
    updateMany: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    ...overrides,
  };
}

function makeClient(collection: ReturnType<typeof fakeCollection>) {
  const dbImpl = { collection: vi.fn().mockReturnValue(collection) } as unknown as Db;
  const config: MongoConfig = { uri: "mongodb://unused", database: "TestDb", dbImpl };
  return createMongoDbClient(config);
}

describe("mongoClient", () => {
  describe("findOne", () => {
    it("returns the document on success", async () => {
      const collection = fakeCollection({ findOne: vi.fn().mockResolvedValue({ _id: "abc", name: "Ada" }) });
      const client = makeClient(collection);

      const result = await client.findOne("User", { _id: "abc" });

      expect(result).toEqual({ _id: "abc", name: "Ada" });
      expect(collection.findOne).toHaveBeenCalledWith({ _id: "abc" }, { projection: undefined, sort: undefined });
    });

    it("returns null when no document matches (not an error)", async () => {
      const collection = fakeCollection({ findOne: vi.fn().mockResolvedValue(null) });
      const client = makeClient(collection);

      expect(await client.findOne("User", { _id: "missing" })).toBeNull();
    });

    it("passes through an ObjectId-shaped filter untouched", async () => {
      const collection = fakeCollection();
      const client = makeClient(collection);

      await client.findOne("Playground", { _id: { $oid: "507f1f77bcf86cd799439011" } });

      expect(collection.findOne.mock.calls[0][0]).toEqual({ _id: { $oid: "507f1f77bcf86cd799439011" } });
    });

    it("forwards projection and sort when provided", async () => {
      const collection = fakeCollection();
      const client = makeClient(collection);

      await client.findOne("User", { email: "a@b.com" }, { projection: { name: 1 }, sort: { createdAt: -1 } });

      expect(collection.findOne).toHaveBeenCalledWith(
        { email: "a@b.com" },
        { projection: { name: 1 }, sort: { createdAt: -1 } }
      );
    });
  });

  describe("find", () => {
    it("returns an empty array when no documents match", async () => {
      const collection = fakeCollection();
      const client = makeClient(collection);

      expect(await client.find("Account", { userId: "u1" })).toEqual([]);
    });

    it("returns the documents from the cursor's toArray()", async () => {
      const toArray = vi.fn().mockResolvedValue([{ _id: "a1" }, { _id: "a2" }]);
      const collection = fakeCollection({ find: vi.fn().mockReturnValue({ toArray }) });
      const client = makeClient(collection);

      const result = await client.find("Account", { userId: "u1" });

      expect(result).toEqual([{ _id: "a1" }, { _id: "a2" }]);
    });

    it("forwards limit and skip only when provided", async () => {
      const collection = fakeCollection();
      const client = makeClient(collection);

      await client.find("Playground", {}, { limit: 10, skip: 5 });

      expect(collection.find).toHaveBeenCalledWith(
        {},
        { projection: undefined, sort: undefined, skip: 5, limit: 10 }
      );
    });
  });

  describe("insertOne / insertMany", () => {
    it("returns the inserted id as a string", async () => {
      const collection = fakeCollection({ insertOne: vi.fn().mockResolvedValue({ insertedId: "new-id" }) });
      const client = makeClient(collection);

      expect(await client.insertOne("User", { _id: "new-id", name: "Ada" })).toEqual({ insertedId: "new-id" });
    });

    it("short-circuits insertMany with an empty array, never touching the collection", async () => {
      const collection = fakeCollection();
      const client = makeClient(collection);

      expect(await client.insertMany("PlaygroundEnvVar", [])).toEqual({ insertedIds: [] });
      expect(collection.insertMany).not.toHaveBeenCalled();
    });

    it("returns inserted ids for a non-empty batch (driver returns an index-keyed object)", async () => {
      const collection = fakeCollection({
        insertMany: vi.fn().mockResolvedValue({ insertedIds: { 0: "a", 1: "b" } }),
      });
      const client = makeClient(collection);

      const result = await client.insertMany("PlaygroundEnvVar", [{ key: "A" }, { key: "B" }]);

      expect(result).toEqual({ insertedIds: ["a", "b"] });
    });
  });

  describe("updateOne / updateMany / deleteOne / deleteMany", () => {
    it("reports matched/modified counts and stringifies upsertedId when present", async () => {
      const collection = fakeCollection({
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0, upsertedId: "new-id" }),
      });
      const client = makeClient(collection);

      const result = await client.updateOne("User", { _id: "u1" }, { $set: { name: "Bea" } }, { upsert: true });

      expect(result).toEqual({ matchedCount: 0, modifiedCount: 0, upsertedId: "new-id" });
      expect(collection.updateOne).toHaveBeenCalledWith({ _id: "u1" }, { $set: { name: "Bea" } }, { upsert: true });
    });

    it("omits upsertedId when the driver doesn't return one", async () => {
      const collection = fakeCollection({
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
      });
      const client = makeClient(collection);

      const result = await client.updateOne("User", { _id: "u1" }, { $set: { name: "Bea" } });

      expect(result.upsertedId).toBeUndefined();
    });

    it("reports matched/modified counts for updateMany", async () => {
      const collection = fakeCollection({
        updateMany: vi.fn().mockResolvedValue({ matchedCount: 3, modifiedCount: 3 }),
      });
      const client = makeClient(collection);

      expect(await client.updateMany("PlaygroundEnvVar", { playgroundId: "p1" }, { $set: { value: "x" } })).toEqual({
        matchedCount: 3,
        modifiedCount: 3,
      });
    });

    it("reports deletedCount for deleteOne and deleteMany", async () => {
      const collection = fakeCollection({
        deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ deletedCount: 4 }),
      });
      const client = makeClient(collection);

      expect(await client.deleteOne("Account", { _id: "a1" })).toEqual({ deletedCount: 1 });
      expect(await client.deleteMany("StarMark", { userId: "u1" })).toEqual({ deletedCount: 4 });
    });
  });

  describe("error handling", () => {
    it("wraps a thrown driver error in a DbError with operation/collection/cause", async () => {
      const originalError = new Error("boom");
      const collection = fakeCollection({ findOne: vi.fn().mockRejectedValue(originalError) });
      const client = makeClient(collection);

      const err = await client.findOne("User", { _id: "u1" }).catch((e) => e);

      expect(err).toBeInstanceOf(DbError);
      expect(err.operation).toBe("findOne");
      expect(err.collection).toBe("User");
      expect(err.cause).toBe(originalError);
    });

    it("marks a MongoNetworkError as retryable", async () => {
      const networkError = new Error("connection reset");
      networkError.name = "MongoNetworkError";
      const collection = fakeCollection({ insertOne: vi.fn().mockRejectedValue(networkError) });
      const client = makeClient(collection);

      const err = await client.insertOne("User", { _id: "u1" }).catch((e) => e);

      expect(err).toBeInstanceOf(DbError);
      expect(err.retryable).toBe(true);
    });

    it("marks a MongoServerSelectionError as retryable", async () => {
      const selectionError = new Error("no primary available");
      selectionError.name = "MongoServerSelectionError";
      const collection = fakeCollection({ find: vi.fn().mockReturnValue({ toArray: () => Promise.reject(selectionError) }) });
      const client = makeClient(collection);

      const err = await client.find("User", {}).catch((e) => e);

      expect(err).toBeInstanceOf(DbError);
      expect(err.retryable).toBe(true);
    });

    it("does not mark an ordinary logic error (e.g. duplicate key) as retryable", async () => {
      const duplicateKeyError = new Error("E11000 duplicate key error");
      duplicateKeyError.name = "MongoServerError";
      const collection = fakeCollection({ insertOne: vi.fn().mockRejectedValue(duplicateKeyError) });
      const client = makeClient(collection);

      const err = await client.insertOne("User", { _id: "u1" }).catch((e) => e);

      expect(err).toBeInstanceOf(DbError);
      expect(err.retryable).toBe(false);
    });

    it("respects an explicit retryable error label when present", async () => {
      const labeledError: any = new Error("transient");
      labeledError.name = "MongoServerError";
      labeledError.hasErrorLabel = (label: string) => label === "TransientTransactionError";
      const collection = fakeCollection({ deleteOne: vi.fn().mockRejectedValue(labeledError) });
      const client = makeClient(collection);

      const err = await client.deleteOne("User", { _id: "u1" }).catch((e) => e);

      expect(err.retryable).toBe(true);
    });
  });

  describe("loadMongoConfigFromEnv", () => {
    const ORIGINAL_ENV = { ...process.env };

    beforeEach(() => {
      delete process.env.DATABASE_URL;
      delete process.env.MONGODB_DATABASE;
    });

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    it("throws listing every missing env var", () => {
      expect(() => loadMongoConfigFromEnv()).toThrow(/DATABASE_URL, MONGODB_DATABASE/);
    });

    it("returns a config object when all env vars are present", () => {
      process.env.DATABASE_URL = "mongodb+srv://user:pass@cluster0.example.mongodb.net/TestDb";
      process.env.MONGODB_DATABASE = "TestDb";

      expect(loadMongoConfigFromEnv()).toEqual({
        uri: "mongodb+srv://user:pass@cluster0.example.mongodb.net/TestDb",
        database: "TestDb",
      });
    });
  });
});
