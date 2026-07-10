import { describe, it, expect, vi } from "vitest";
import type { DbClient } from "../../mongoClient";
import { COLLECTIONS } from "../../collections";
import { findUserByIdWithAccounts, deleteUserCascade } from "../users";

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

const USER_DOC = {
  _id: "u1",
  name: "Ada",
  email: "ada@example.com",
  image: null,
  role: "USER",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("findUserByIdWithAccounts (relation read)", () => {
  it("merges the user with all their linked accounts, exposing `id` not `_id` on both", async () => {
    const client = mockClient({
      findOne: vi.fn().mockResolvedValue(USER_DOC),
      find: vi.fn().mockResolvedValue([
        { _id: "a1", userId: "u1", type: "oauth", provider: "github", providerAccountId: "1" },
      ]),
    });

    const result = await findUserByIdWithAccounts("u1", client);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("u1");
    expect(result!.accounts).toHaveLength(1);
    expect(result!.accounts[0].id).toBe("a1");
    expect((result!.accounts[0] as any)._id).toBeUndefined();
    expect(client.find).toHaveBeenCalledWith(COLLECTIONS.Account, { userId: "u1" });
  });

  it("returns null and skips the accounts lookup when the user doesn't exist", async () => {
    const findSpy = vi.fn().mockResolvedValue([]);
    const client = mockClient({ findOne: vi.fn().mockResolvedValue(null), find: findSpy });

    const result = await findUserByIdWithAccounts("missing", client);

    expect(result).toBeNull();
    expect(findSpy).not.toHaveBeenCalled();
  });
});

describe("deleteUserCascade (application-level cascade, replacing Prisma onDelete: Cascade)", () => {
  it("cascades every dependent collection, including each owned playground's own cascade, before deleting the user", async () => {
    const order: string[] = [];
    const client = mockClient({
      find: vi.fn().mockImplementation((collection: string) => {
        if (collection === COLLECTIONS.Playground) {
          return Promise.resolve([{ _id: "p1", userId: "u1" }]);
        }
        return Promise.resolve([]);
      }),
      deleteMany: vi.fn().mockImplementation((collection: string) => {
        order.push(collection);
        return Promise.resolve({ deletedCount: 1 });
      }),
      deleteOne: vi.fn().mockImplementation((collection: string) => {
        order.push(collection);
        return Promise.resolve({ deletedCount: 1 });
      }),
    });

    await deleteUserCascade("u1", client);

    // The owned Playground's own cascade (StarMark, TemplateFile, PlaygroundEnvVar,
    // then the Playground itself) must fully run before the User's direct
    // dependents (Account, StarMark-by-user, ChatMessage) and the User document.
    expect(order).toEqual([
      COLLECTIONS.StarMark,
      COLLECTIONS.TemplateFile,
      COLLECTIONS.PlaygroundEnvVar,
      COLLECTIONS.Playground,
      COLLECTIONS.Account,
      COLLECTIONS.StarMark,
      COLLECTIONS.ChatMessage,
      COLLECTIONS.User,
    ]);
  });

  it("still deletes the user's direct dependents when they own no playgrounds", async () => {
    const order: string[] = [];
    const client = mockClient({
      find: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockImplementation((collection: string) => {
        order.push(collection);
        return Promise.resolve({ deletedCount: 1 });
      }),
      deleteOne: vi.fn().mockImplementation((collection: string) => {
        order.push(collection);
        return Promise.resolve({ deletedCount: 1 });
      }),
    });

    await deleteUserCascade("u1", client);

    expect(order).toEqual([COLLECTIONS.Account, COLLECTIONS.StarMark, COLLECTIONS.ChatMessage, COLLECTIONS.User]);
  });
});
