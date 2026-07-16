"use server";

import { findPlaygroundById } from "@/lib/db/repositories/playgrounds";
import { currentUser } from "@/modules/auth/actions";
import { restoreCheckpoint, listCheckpoints, type CheckpointSummary } from "@/lib/checkpoint/store";
import type { TemplateFolder } from "../lib/path-to-json";

export type RevertResult =
  | { status: "restored"; templateData: TemplateFolder }
  | { status: "expired" }
  | { status: "error"; error: string };

/**
 * Restores a playground's project state to exactly what one of its own
 * Redis checkpoints captured — the "Revert to before this task" action.
 * Distinguishes "checkpoint expired" (a normal, expected outcome once the
 * TTL window passes — see lib/checkpoint/store.ts) from a real error, so the
 * UI can show a clear message instead of a generic failure toast.
 */
export async function revertPlaygroundToCheckpoint(playgroundId: string, checkpointId: string): Promise<RevertResult> {
  const user = await currentUser();
  if (!user?.id) return { status: "error", error: "Not authenticated" };

  const playground = await findPlaygroundById(playgroundId, { projection: { userId: 1 } });
  if (!playground) return { status: "error", error: "Project not found" };
  if (playground.userId !== user.id) return { status: "error", error: "Unauthorized" };

  const result = await restoreCheckpoint(playgroundId, checkpointId);
  if (result.status === "restored") return { status: "restored", templateData: result.tree };
  if (result.status === "expired") return { status: "expired" };
  return { status: "error", error: result.error };
}

/** Newest-first checkpoint history for a project — powers the Agent panel's checkpoint list. */
export async function listProjectCheckpoints(playgroundId: string): Promise<{ checkpoints: CheckpointSummary[]; error?: string }> {
  const user = await currentUser();
  if (!user?.id) return { checkpoints: [], error: "Not authenticated" };

  const playground = await findPlaygroundById(playgroundId, { projection: { userId: 1 } });
  if (!playground) return { checkpoints: [], error: "Project not found" };
  if (playground.userId !== user.id) return { checkpoints: [], error: "Unauthorized" };

  const checkpoints = await listCheckpoints(playgroundId);
  return { checkpoints };
}
