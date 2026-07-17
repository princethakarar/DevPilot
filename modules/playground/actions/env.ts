"use server";

import { findPlaygroundById, updatePlaygroundEnvFilePath } from "@/lib/db/repositories/playgrounds";
import { findEnvVarsByPlayground, replaceEnvVarsForPlayground } from "@/lib/db/repositories/playgroundEnvVars";
import { currentUser } from "@/modules/auth/actions";
import type { EnvVarPair } from "../lib/env-merge";

async function assertOwner(playgroundId: string, userId: string): Promise<boolean> {
  const playground = await findPlaygroundById(playgroundId, {
    projection: { userId: 1 },
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

  return findEnvVarsByPlayground(playgroundId);
};

/**
 * Replace the full set of env vars for a playground. Passing an empty array
 * clears all of them (used when the user deletes/empties the .env file).
 *
 * `path` is the folder (from tree root, exclusive) the ".env" file lives in.
 * It's persisted on the Playground doc — not derivable from the tree on
 * reload, since the tree never contains ".env" once it's been stripped out
 * here. Pass `null` (or omit) for a root-level ".env", or when clearing vars.
 */
export const setPlaygroundEnvVars = async (
  playgroundId: string,
  vars: EnvVarPair[],
  path?: string[] | null
): Promise<{ success: boolean; error?: string }> => {
  const user = await currentUser();
  if (!user?.id) return { success: false, error: "Not authenticated" };
  if (!(await assertOwner(playgroundId, user.id))) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await replaceEnvVarsForPlayground(playgroundId, vars);
    await updatePlaygroundEnvFilePath(playgroundId, vars.length > 0 ? path ?? [] : null);
    return { success: true };
  } catch (error) {
    console.error("setPlaygroundEnvVars error:", error);
    return { success: false, error: "Failed to save environment variables" };
  }
};
