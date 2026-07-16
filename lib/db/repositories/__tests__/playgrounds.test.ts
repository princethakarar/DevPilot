import { describe, it, expect, vi } from "vitest";
import type { DbClient } from "../../mongoClient";
import { COLLECTIONS } from "../../collections";
import {
  findPlaygroundWithTemplateFiles,
  findPlaygroundSummaryWithTemplateFiles,
  findPlaygroundsForUserWithOwnerAndStar,
  createPlaygroundWithTemplateFile,
  deletePlaygroundCascade,
} from "../playgrounds";

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

const PLAYGROUND_DOC = {
  _id: "p1",
  title: "My App",
  description: null,
  template: "REACT",
  githubRepo: null,
  githubBranch: null,
  githubBaseContent: null,
  userId: "u1",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("findPlaygroundWithTemplateFiles (relation read)", () => {
  it("merges the playground with its template files' content, exposing `id` not `_id`", async () => {
    const client = mockClient({
      findOne: vi.fn().mockResolvedValue(PLAYGROUND_DOC),
      find: vi.fn().mockResolvedValue([{ _id: "t1", content: '{"a":1}', playgroundId: "p1" }]),
    });

    const result = await findPlaygroundWithTemplateFiles("p1", client);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("p1");
    expect((result as any)._id).toBeUndefined();
    expect(result!.templateFiles).toEqual([{ content: '{"a":1}' }]);
    expect(client.findOne).toHaveBeenCalledWith(COLLECTIONS.Playground, { _id: "p1" }, {});
    expect(client.find).toHaveBeenCalledWith(COLLECTIONS.TemplateFile, { playgroundId: "p1" });
  });

  it("returns null and skips the template-file lookup when the playground doesn't exist", async () => {
    const findSpy = vi.fn().mockResolvedValue([]);
    const client = mockClient({ findOne: vi.fn().mockResolvedValue(null), find: findSpy });

    const result = await findPlaygroundWithTemplateFiles("missing", client);

    expect(result).toBeNull();
    expect(findSpy).not.toHaveBeenCalled();
  });
});

describe("findPlaygroundSummaryWithTemplateFiles (projected relation read)", () => {
  it("requests only title/githubRepo/githubBranch/githubBaseContent/envFilePath and merges template file contents", async () => {
    const client = mockClient({
      findOne: vi.fn().mockResolvedValue({
        _id: "p1",
        title: "My App",
        githubRepo: "owner/repo",
        githubBranch: "main",
        githubBaseContent: '{"a":1}',
        envFilePath: ["server"],
      }),
      find: vi.fn().mockResolvedValue([{ _id: "t1", content: "content-a" }]),
    });

    const result = await findPlaygroundSummaryWithTemplateFiles("p1", client);

    expect(result).toEqual({
      title: "My App",
      githubRepo: "owner/repo",
      githubBranch: "main",
      githubBaseContent: '{"a":1}',
      envFilePath: ["server"],
      templateFiles: [{ content: "content-a" }],
    });
    expect(client.findOne).toHaveBeenCalledWith(
      COLLECTIONS.Playground,
      { _id: "p1" },
      { projection: { title: 1, githubRepo: 1, githubBranch: 1, githubBaseContent: 1, envFilePath: 1 } }
    );
  });

  it("defaults envFilePath to null for legacy documents that predate the field", async () => {
    const client = mockClient({
      findOne: vi.fn().mockResolvedValue({
        _id: "p1",
        title: "My App",
        githubRepo: null,
        githubBranch: null,
      }),
      find: vi.fn().mockResolvedValue([]),
    });

    const result = await findPlaygroundSummaryWithTemplateFiles("p1", client);

    expect(result?.envFilePath).toBeNull();
  });
});

describe("findPlaygroundsForUserWithOwnerAndStar (nested filtered relation)", () => {
  it("attaches the owner and the owner's own star mark per playground", async () => {
    const client = mockClient({
      find: vi
        .fn()
        .mockImplementation((collection: string) => {
          if (collection === COLLECTIONS.Playground) {
            return Promise.resolve([
              { ...PLAYGROUND_DOC, _id: "p1" },
              { ...PLAYGROUND_DOC, _id: "p2" },
            ]);
          }
          if (collection === COLLECTIONS.StarMark) {
            return Promise.resolve([{ playgroundId: "p1", isMarked: true }]);
          }
          return Promise.resolve([]);
        }),
      findOne: vi.fn().mockResolvedValue({
        _id: "u1",
        name: "Ada",
        email: "ada@example.com",
        image: null,
        role: "USER",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    });

    const result = await findPlaygroundsForUserWithOwnerAndStar("u1", client);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("p1");
    expect(result[0].user.id).toBe("u1");
    expect(result[0].Starmark).toEqual([{ isMarked: true }]);
    // p2 has no matching StarMark row — matches Prisma's original filtered-include shape.
    expect(result[1].Starmark).toEqual([]);
  });

  it("returns [] without querying user/starmarks when the owner has no playgrounds", async () => {
    const findOneSpy = vi.fn();
    const client = mockClient({ find: vi.fn().mockResolvedValue([]), findOne: findOneSpy });

    const result = await findPlaygroundsForUserWithOwnerAndStar("u1", client);

    expect(result).toEqual([]);
    expect(findOneSpy).not.toHaveBeenCalled();
  });

  it("throws if the owner's User document is missing (violates the required-relation invariant)", async () => {
    const client = mockClient({
      find: vi.fn().mockResolvedValue([PLAYGROUND_DOC]),
      findOne: vi.fn().mockResolvedValue(null),
    });

    await expect(findPlaygroundsForUserWithOwnerAndStar("u1", client)).rejects.toThrow(/owner u1 not found/);
  });
});

describe("createPlaygroundWithTemplateFile (nested create)", () => {
  it("creates the playground first, then a template file referencing it", async () => {
    const calls: string[] = [];
    const client = mockClient({
      insertOne: vi.fn().mockImplementation((collection: string) => {
        calls.push(collection);
        return Promise.resolve({ insertedId: "generated-id" });
      }),
    });

    const playground = await createPlaygroundWithTemplateFile(
      { title: "Imported", userId: "u1" },
      '{"root":true}',
      client
    );

    expect(calls).toEqual([COLLECTIONS.Playground, COLLECTIONS.TemplateFile]);
    const templateFileDoc = (client.insertOne as any).mock.calls[1][1];
    expect(templateFileDoc.playgroundId).toBe(playground.id);
    expect(templateFileDoc.content).toBe('{"root":true}');
  });
});

describe("deletePlaygroundCascade (application-level cascade, replacing Prisma onDelete: Cascade)", () => {
  it("deletes all dependent collections before the playground itself, in dependency order", async () => {
    const order: string[] = [];
    const client = mockClient({
      deleteMany: vi.fn().mockImplementation((collection: string) => {
        order.push(collection);
        return Promise.resolve({ deletedCount: 1 });
      }),
      deleteOne: vi.fn().mockImplementation((collection: string) => {
        order.push(collection);
        return Promise.resolve({ deletedCount: 1 });
      }),
    });

    await deletePlaygroundCascade("p1", client);

    expect(order).toEqual([
      COLLECTIONS.StarMark,
      COLLECTIONS.TemplateFile,
      COLLECTIONS.PlaygroundEnvVar,
      COLLECTIONS.Playground,
    ]);
  });
});
