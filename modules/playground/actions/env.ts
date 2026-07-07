"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/modules/auth/actions";
import type { EnvVarPair } from "../lib/env-merge";

export type { EnvVarPair };

async function assertOwner(playgroundId: string, userId: string): Promise<boolean> {
  const playground = await db.playground.findUnique({
    where: { id: playgroundId },
    select: { userId: true },
  });
  return playground?.userId === userId;
}

/**
 * Fetch a playground's env vars. Returns [] (not an error) for a playground
 * with no rows yet — callers use that to decide whether to leave an existing
 * inline .env file in the tree untouched (pre-migration playgrounds).
 */
export const getPlaygroundEnvVars = async (
  playgroundId: string
): Promise<EnvVarPair[]> => {
  const user = await currentUser();
  if (!user?.id) return [];
  if (!(await assertOwner(playgroundId, user.id))) return [];

  const rows = await db.playgroundEnvVar.findMany({
    where: { playgroundId },
    select: { key: true, value: true },
  });
  return rows;
};

/**
 * Replace the full set of env vars for a playground. Passing an empty array
 * clears all of them (used when the user deletes/empties the .env file).
 */
export const setPlaygroundEnvVars = async (
  playgroundId: string,
  vars: EnvVarPair[]
): Promise<{ success: boolean; error?: string }> => {
  const user = await currentUser();
  if (!user?.id) return { success: false, error: "Not authenticated" };
  if (!(await assertOwner(playgroundId, user.id))) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await db.playgroundEnvVar.deleteMany({ where: { playgroundId } });
    if (vars.length > 0) {
      await db.playgroundEnvVar.createMany({
        data: vars.map((v) => ({ playgroundId, key: v.key, value: v.value })),
      });
    }
    return { success: true };
  } catch (error) {
    console.error("setPlaygroundEnvVars error:", error);
    return { success: false, error: "Failed to save environment variables" };
  }
};
