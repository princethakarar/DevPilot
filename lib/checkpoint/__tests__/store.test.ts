import { describe, it, expect, vi } from "vitest";
import type { DbClient } from "@/lib/db/mongoClient";
import { COLLECTIONS } from "@/lib/db/collections";
import type { TemplateFolder } from "@/modules/playground/lib/path-to-json";
import { createCheckpoint, restoreCheckpoint, listCheckpoints } from "../store";

interface CheckpointDoc {
  _id: string;
  projectId: string;
  label: string;
  reason: string;
  rootFolderName: string;
  files: { path: string; content: string; encoding?: string | null }[];
  createdAt: Date;
}

/**
 * Fake DbClient covering the three collections createCheckpoint/
 * restoreCheckpoint actually touch: Playground + TemplateFile (the
 * authoritative file store) and project_checkpoints (the new checkpoint
 * collection). Mirrors the mockClient pattern already established in
 * lib/db/repositories/__tests__/playgrounds.test.ts.
 */
function createFakeDb(playgroundId: string, initialTree: TemplateFolder) {
  let templateFileDoc: { _id: string; playgroundId: string; content: unknown } | null = {
    _id: "tf1",
    playgroundId,
    content: JSON.stringify(initialTree),
  };
  const playgroundDoc = {
    _id: playgroundId,
    userId: "u1",
    title: "Test",
    description: null,
    template: "REACT",
    githubRepo: null,
    githubBranch: null,
    githubBaseContent: null,
    envFilePath: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const checkpoints = new Map<string, CheckpointDoc>();

  const client = {
    findOne: vi.fn(async (collection: string, filter: Record<string, unknown>) => {
      if (collection === COLLECTIONS.Playground) return filter._id === playgroundId ? playgroundDoc : null;
      if (collection === COLLECTIONS.TemplateFile) {
        return templateFileDoc && templateFileDoc.playgroundId === filter.playgroundId ? templateFileDoc : null;
      }
      if (collection === COLLECTIONS.ProjectCheckpoint) {
        const doc = checkpoints.get(filter._id as string);
        return doc && doc.projectId === filter.projectId ? doc : null;
      }
      return null;
    }),
    find: vi.fn(async (collection: string, filter: Record<string, unknown>) => {
      if (collection === COLLECTIONS.TemplateFile) {
        return templateFileDoc && templateFileDoc.playgroundId === filter.playgroundId ? [templateFileDoc] : [];
      }
      if (collection === COLLECTIONS.ProjectCheckpoint) {
        return [...checkpoints.values()]
          .filter((d) => d.projectId === filter.projectId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return [];
    }),
    insertOne: vi.fn(async (collection: string, doc: Record<string, unknown>) => {
      if (collection === COLLECTIONS.TemplateFile) templateFileDoc = doc as typeof templateFileDoc;
      if (collection === COLLECTIONS.ProjectCheckpoint) checkpoints.set(doc._id as string, doc as unknown as CheckpointDoc);
      return { insertedId: (doc._id as string) ?? "generated-id" };
    }),
    insertMany: vi.fn(async () => ({ insertedIds: [] })),
    updateOne: vi.fn(async (collection: string, _filter: Record<string, unknown>, update: Record<string, unknown>) => {
      if (collection === COLLECTIONS.TemplateFile && templateFileDoc) {
        templateFileDoc = { ...templateFileDoc, ...((update.$set as Record<string, unknown>) ?? {}) };
      }
      return { matchedCount: 1, modifiedCount: 1 };
    }),
    updateMany: vi.fn(async () => ({ matchedCount: 0, modifiedCount: 0 })),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
    deleteMany: vi.fn(async () => ({ deletedCount: 1 })),
    createIndex: vi.fn(async () => "index-name"),
  } as DbClient;

  return {
    client,
    setContent: (tree: TemplateFolder) => {
      if (templateFileDoc) templateFileDoc.content = JSON.stringify(tree);
    },
    getContent: (): TemplateFolder | null => (templateFileDoc ? JSON.parse(templateFileDoc.content as string) : null),
    /**
     * Simulates MongoDB's TTL background monitor physically deleting an
     * expired document. Deliberately NOT "advance a fake clock" — unlike
     * the prior Redis design, Mongo TTL is a periodic background sweep, not
     * query-time filtering, so a find()/findOne() issued before the sweep
     * runs would still return a nominally-expired document. Application
     * code doesn't (and per the migration spec, shouldn't) try to emulate
     * that ~60s window; this helper just represents "the sweep already ran".
     */
    simulateTtlSweep: (checkpointId: string) => {
      checkpoints.delete(checkpointId);
    },
  };
}

const SAMPLE_TREE: TemplateFolder = {
  folderName: "root",
  items: [
    { filename: "package", fileExtension: "json", content: '{"name":"demo"}' },
    {
      folderName: "src",
      items: [{ filename: "index", fileExtension: "ts", content: "console.log('hi')" }],
    },
  ],
};

describe("createCheckpoint + restoreCheckpoint", () => {
  it("restores immediately to exactly what was checkpointed", async () => {
    const db = createFakeDb("proj1", SAMPLE_TREE);

    const created = await createCheckpoint("proj1", "Before: task", "task reason", db.client);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // Simulate drift after the checkpoint: edit an existing file and add a new one.
    db.setContent({
      folderName: "root",
      items: [
        { filename: "package", fileExtension: "json", content: '{"name":"changed"}' },
        { folderName: "src", items: [{ filename: "index", fileExtension: "ts", content: "BROKEN" }] },
        { filename: "extra", fileExtension: "txt", content: "should be removed by restore" },
      ],
    });

    const result = await restoreCheckpoint("proj1", created.checkpoint.id, db.client);
    expect(result.status).toBe("restored");

    const restoredContent = db.getContent()!;
    const names = restoredContent.items.map((it) => ("filename" in it ? it.filename : it.folderName));
    expect(names.sort()).toEqual(["package", "src"]); // added-after-checkpoint "extra" file is gone

    const pkg = restoredContent.items.find((it) => "filename" in it && it.filename === "package");
    expect(pkg && "content" in pkg && pkg.content).toBe('{"name":"demo"}'); // edited-after-checkpoint content reverted

    const srcFolder = restoredContent.items.find((it) => "folderName" in it && it.folderName === "src");
    expect(srcFolder && "items" in srcFolder && srcFolder.items[0]).toMatchObject({ filename: "index", content: "console.log('hi')" });
  });

  it("returns 'expired' from restoreCheckpoint once MongoDB's TTL monitor has swept the document", async () => {
    const db = createFakeDb("proj1", SAMPLE_TREE);
    const created = await createCheckpoint("proj1", "Before: task", "task reason", db.client);
    if (!created.ok) throw new Error("setup failed");

    db.simulateTtlSweep(created.checkpoint.id);

    const result = await restoreCheckpoint("proj1", created.checkpoint.id, db.client);
    expect(result).toEqual({ status: "expired" });
  });

  it("returns 'expired' for an unknown checkpoint id (never crashes/throws)", async () => {
    const db = createFakeDb("proj1", SAMPLE_TREE);
    const result = await restoreCheckpoint("proj1", "does-not-exist", db.client);
    expect(result).toEqual({ status: "expired" });
  });

  it("scopes lookups by projectId — a checkpoint from a different project is never restorable", async () => {
    const db = createFakeDb("proj1", SAMPLE_TREE);
    const created = await createCheckpoint("proj1", "Before", "reason", db.client);
    if (!created.ok) throw new Error("setup failed");

    const result = await restoreCheckpoint("some-other-project", created.checkpoint.id, db.client);
    expect(result).toEqual({ status: "expired" });
  });

  it("rejects a project whose total content exceeds the single-document checkpoint limit with a clear error, not a silent/raw driver failure", async () => {
    // ~16MB across a few files — over MongoDB's 16MB hard document cap.
    const hugeTree: TemplateFolder = {
      folderName: "root",
      items: Array.from({ length: 4 }, (_, i) => ({
        filename: `big${i}`,
        fileExtension: "txt",
        content: "a".repeat(4 * 1024 * 1024),
      })),
    };
    const db = createFakeDb("proj1", hugeTree);

    const result = await createCheckpoint("proj1", "Before", "reason", db.client);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/exceeds the/);
    expect(result.error).toMatch(/16MB/);
  });

  it("handles a project comfortably under the limit (matches Phase 0's real-world size evidence) without any special-casing", async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      filename: `file${i}`,
      fileExtension: "txt",
      content: "x".repeat(50 * 1024), // ~1MB total — in line with the largest real project measured
    }));
    const tree: TemplateFolder = { folderName: "root", items };
    const db = createFakeDb("proj1", tree);

    const created = await createCheckpoint("proj1", "Before", "reason", db.client);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    db.setContent({ folderName: "root", items: [] });
    const restored = await restoreCheckpoint("proj1", created.checkpoint.id, db.client);
    expect(restored.status).toBe("restored");
    if (restored.status !== "restored") return;
    expect(restored.tree.items).toHaveLength(20);
  });
});

describe("listCheckpoints", () => {
  it("lists newest-first", async () => {
    const db = createFakeDb("proj1", SAMPLE_TREE);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const first = await createCheckpoint("proj1", "First", "r1", db.client);
      vi.setSystemTime(new Date("2026-01-01T00:00:01Z"));
      const second = await createCheckpoint("proj1", "Second", "r2", db.client);
      if (!first.ok || !second.ok) throw new Error("setup failed");

      const list = await listCheckpoints("proj1", db.client);
      expect(list.map((c) => c.id)).toEqual([second.checkpoint.id, first.checkpoint.id]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("excludes a checkpoint once MongoDB's TTL monitor has swept it", async () => {
    const db = createFakeDb("proj1", SAMPLE_TREE);
    const created = await createCheckpoint("proj1", "Before", "reason", db.client);
    if (!created.ok) throw new Error("setup failed");

    db.simulateTtlSweep(created.checkpoint.id);

    expect(await listCheckpoints("proj1", db.client)).toEqual([]);
  });

  it("returns an empty list for a project with no checkpoints", async () => {
    const db = createFakeDb("proj1", SAMPLE_TREE);
    expect(await listCheckpoints("no-checkpoints-project", db.client)).toEqual([]);
  });

  it("does not include file content in the listing (lightweight response)", async () => {
    const db = createFakeDb("proj1", SAMPLE_TREE);
    const created = await createCheckpoint("proj1", "Before", "reason", db.client);
    if (!created.ok) throw new Error("setup failed");

    const list = await listCheckpoints("proj1", db.client);
    expect(list[0]).not.toHaveProperty("files");
  });
});
