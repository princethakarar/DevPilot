import { describe, it, expect, vi } from "vitest";
import type { DbClient } from "../../mongoClient";
import { COLLECTIONS } from "../../collections";
import { upsertTemplateFileForPlayground } from "../templateFiles";

function mockClient(overrides: Partial<DbClient> = {}): DbClient {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    insertOne: vi.fn().mockResolvedValue({ insertedId: "generated-id" }),
    insertMany: vi.fn().mockResolvedValue({ insertedIds: [] }),
    updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    updateMany: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    ...overrides,
  } as DbClient;
}

describe("upsertTemplateFileForPlayground (replaces Prisma's db.templateFile.upsert)", () => {
  it("updates in place when a TemplateFile already exists for the playground", async () => {
    const client = mockClient({
      findOne: vi.fn().mockResolvedValue({
        _id: "t1",
        playgroundId: "p1",
        content: "old-content",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    });

    const result = await upsertTemplateFileForPlayground("p1", "new-content", client);

    expect(client.updateOne).toHaveBeenCalledWith(
      COLLECTIONS.TemplateFile,
      { playgroundId: "p1" },
      expect.objectContaining({ $set: expect.objectContaining({ content: "new-content" }) })
    );
    expect(client.insertOne).not.toHaveBeenCalled();
    expect(result.content).toBe("new-content");
    expect(result.id).toBe("t1");
  });

  it("creates a new TemplateFile when none exists yet for the playground", async () => {
    const client = mockClient({ findOne: vi.fn().mockResolvedValue(null) });

    const result = await upsertTemplateFileForPlayground("p1", "first-content", client);

    expect(client.updateOne).not.toHaveBeenCalled();
    expect(client.insertOne).toHaveBeenCalledWith(
      COLLECTIONS.TemplateFile,
      expect.objectContaining({ playgroundId: "p1", content: "first-content" })
    );
    expect(result.content).toBe("first-content");
  });
});
