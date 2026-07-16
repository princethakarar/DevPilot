import "server-only";
import { findPlaygroundWithTemplateFiles } from "@/lib/db/repositories/playgrounds";
import { upsertTemplateFileForPlayground } from "@/lib/db/repositories/templateFiles";
import {
  insertProjectCheckpoint,
  findProjectCheckpoint,
  findProjectCheckpointSummaries,
} from "@/lib/db/repositories/projectCheckpoints";
import type { DbClient } from "@/lib/db/mongoClient";
import type { TemplateFolder, TemplateFile } from "@/modules/playground/lib/path-to-json";
import { getFileDisplayName, splitFilename } from "@/modules/playground/lib";
import { CHECKPOINT_TTL_SECONDS } from "./constants";

export { CHECKPOINT_TTL_SECONDS };

/**
 * Short-term, auto-expiring rollback safety net for the autonomous agent.
 *
 * Storage: MongoDB (`project_checkpoints`, see lib/db/schemas.ts), not a
 * cache store — checkpoints are the SOLE rollback path for a mode that
 * auto-applies every file edit with no pause gate, so they live in the same
 * durable database as the project files themselves. (Previously backed by
 * Redis/Upstash; migrated because a cache-oriented store was the wrong
 * durability tier for something this safety-critical. See git history for
 * the prior lib/checkpoint/redisClient.ts implementation.)
 *
 * A checkpoint is one embedded document — the project's entire file tree,
 * `files` inline. Single-document is safe here specifically because the
 * LIVE project store (TemplateFile.content) is already one Mongo document
 * per project bound by the same 16MB limit; a checkpoint can never exceed
 * what the live store already had to fit.
 *
 * Expiry is a TTL index on `createdAt` (see scripts/ensure-checkpoint-indexes.ts
 * — must be run once against the database; this app has no automatic index
 * provisioning). MongoDB's TTL background monitor runs roughly every 60
 * seconds, so a checkpoint may remain readable for up to ~60s past its
 * nominal TTL. That's an accepted characteristic of MongoDB TTL indexes, not
 * something worked around with exact-time filtering here — a missing
 * document (whether genuinely swept or never existed) is simply treated as
 * "expired", exactly like the prior Redis design's read-time expiry check.
 */

// MongoDB's hard per-document limit is 16MB. A checkpoint is a single
// embedded document (see file header) — checked proactively here with a real
// margin below the hard cap, so an oversized project gets a specific,
// actionable error instead of a raw BSON-size driver exception surfacing
// through the generic catch below.
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15MB

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf-8");
}
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface FlatFile {
  content: string;
  encoding?: "base64";
}

function flattenTree(folder: TemplateFolder, prefix = ""): Map<string, FlatFile> {
  const result = new Map<string, FlatFile>();
  for (const item of folder.items) {
    if ("folderName" in item) {
      const subPrefix = prefix ? `${prefix}/${item.folderName}` : item.folderName;
      for (const [path, entry] of flattenTree(item, subPrefix)) result.set(path, entry);
    } else {
      const name = getFileDisplayName(item.filename, item.fileExtension);
      const path = prefix ? `${prefix}/${name}` : name;
      result.set(path, {
        content: typeof item.content === "string" ? item.content : "",
        encoding: item.encoding === "base64" ? "base64" : undefined,
      });
    }
  }
  return result;
}

function unflattenTree(files: Map<string, FlatFile>, rootFolderName: string): TemplateFolder {
  interface TempFolder {
    folderName: string;
    items: (TempFolder | TemplateFile)[];
  }
  const root: TempFolder = { folderName: rootFolderName, items: [] };

  for (const [path, entry] of files) {
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    let current = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const name = segments[i];
      let next = current.items.find((it): it is TempFolder => "folderName" in it && it.folderName === name);
      if (!next) {
        next = { folderName: name, items: [] };
        current.items.push(next);
      }
      current = next;
    }
    const { filename, fileExtension } = splitFilename(segments[segments.length - 1]);
    current.items.push({
      filename,
      fileExtension,
      content: entry.content,
      ...(entry.encoding ? { encoding: entry.encoding } : {}),
    });
  }

  return root as unknown as TemplateFolder;
}

export interface CheckpointMeta {
  id: string;
  label: string;
  reason: string;
  createdAt: number;
  fileCount: number;
}

export interface CheckpointSummary {
  id: string;
  label: string;
  reason: string;
  createdAt: number;
}

export type CreateCheckpointResult =
  | { ok: true; checkpoint: CheckpointMeta }
  | { ok: false; error: string };

/**
 * Snapshots the project's CURRENT file tree (read fresh from the
 * authoritative store, never trusts caller-supplied state) into one
 * project_checkpoints document. Any failure (bad content, a DB write error)
 * is caught and returned as `{ ok: false }` rather than thrown — the caller
 * (the agent orchestrator's pre-task checkpoint step) treats that as "no
 * safety net, stop before any writes", the same fail-stop contract the
 * prior Redis-backed version used, kept identical here so orchestrator.ts
 * needed zero changes for this migration.
 */
export async function createCheckpoint(
  projectId: string,
  label: string,
  reason: string,
  dbClient?: DbClient
): Promise<CreateCheckpointResult> {
  try {
    const playground = await findPlaygroundWithTemplateFiles(projectId, dbClient);
    if (!playground) return { ok: false, error: "Project not found" };

    const rawContent = playground.templateFiles[0]?.content;
    if (!rawContent) return { ok: false, error: "No file content found to checkpoint" };

    const tree: TemplateFolder = typeof rawContent === "string" ? JSON.parse(rawContent) : (rawContent as TemplateFolder);
    const files = flattenTree(tree);
    const fileDocs = [...files.entries()].map(([path, entry]) => ({
      path,
      content: entry.content,
      encoding: entry.encoding ?? null,
    }));

    const totalBytes = fileDocs.reduce((sum, f) => sum + byteLength(f.content), 0);
    if (totalBytes > MAX_DOCUMENT_BYTES) {
      return {
        ok: false,
        error: `Cannot checkpoint — this project's total content (${formatBytes(totalBytes)}) exceeds the ${formatBytes(MAX_DOCUMENT_BYTES)} single-document checkpoint limit (MongoDB's hard cap is 16MB per document).`,
      };
    }

    const doc = await insertProjectCheckpoint(
      { projectId, label, reason, rootFolderName: tree.folderName, files: fileDocs },
      dbClient
    );

    return {
      ok: true,
      checkpoint: { id: doc.id, label: doc.label, reason: doc.reason, createdAt: doc.createdAt.getTime(), fileCount: fileDocs.length },
    };
  } catch (err) {
    return { ok: false, error: `Failed to write checkpoint: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export type RestoreCheckpointResult =
  | { status: "restored"; tree: TemplateFolder }
  | { status: "expired" }
  | { status: "error"; error: string };

/**
 * Restores the project's file tree to exactly what a checkpoint captured,
 * through the SAME save path autosave/the agent's write_file tool uses
 * (upsertTemplateFileForPlayground) — wholesale replacement, so any file
 * that exists now but wasn't in the checkpoint is implicitly deleted, no
 * separate diff/delete step required. A missing document — whether it was
 * genuinely TTL-swept or the id is simply invalid — is reported as
 * "expired", never an unhandled error.
 */
export async function restoreCheckpoint(
  projectId: string,
  checkpointId: string,
  dbClient?: DbClient
): Promise<RestoreCheckpointResult> {
  try {
    const doc = await findProjectCheckpoint(projectId, checkpointId, dbClient);
    if (!doc) return { status: "expired" };

    const files = new Map<string, FlatFile>();
    for (const f of doc.files) {
      files.set(f.path, { content: f.content, encoding: f.encoding ?? undefined });
    }

    const tree = unflattenTree(files, doc.rootFolderName);
    await upsertTemplateFileForPlayground(projectId, JSON.stringify(tree), dbClient);

    return { status: "restored", tree };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Newest-first checkpoint history — file content excluded at the query level (see findProjectCheckpointSummaries). */
export async function listCheckpoints(projectId: string, dbClient?: DbClient): Promise<CheckpointSummary[]> {
  const docs = await findProjectCheckpointSummaries(projectId, dbClient);
  return docs.map((d) => ({ id: d.id, label: d.label, reason: d.reason, createdAt: d.createdAt.getTime() }));
}
