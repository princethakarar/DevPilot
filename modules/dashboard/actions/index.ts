"use server";

import { createStarMark, deleteStarMark } from "@/lib/db/repositories/starMarks";
import {
  findPlaygroundsForUserWithOwnerAndStar,
  findPlaygroundByUserAndTitle,
  createPlayground as createPlaygroundRow,
  deletePlaygroundCascade,
  updatePlayground,
  findPlaygroundById,
} from "@/lib/db/repositories/playgrounds";
import { upsertTemplateFileForPlayground } from "@/lib/db/repositories/templateFiles";
import { loadTemplateScaffold } from "@/lib/template";
import { countTemplateFiles } from "@/modules/playground/lib/path-to-json";
import { currentUser } from "@/modules/auth/actions";
import { revalidatePath } from "next/cache";

export const toggleStarMarked = async (
  playgroundId: string,
  isChecked: boolean
) => {
  const user = await currentUser();
  const userId = user?.id;
  if (!userId) {
    throw new Error("User Id is Required");
  }

  try {
    if (isChecked) {
      await createStarMark({
        userId,
        playgroundId,
        isMarked: isChecked,
      });
    } else {
      await deleteStarMark(userId, playgroundId);
    }

     revalidatePath("/dashboard");
    return { success: true, isMarked: isChecked };
  } catch (error) {
       console.error("Error updating problem:", error);
    return { success: false, error: "Failed to update problem" };
  }
};

export const getAllPlaygroundForUser = async () => {
  const user = await currentUser();
  if (!user?.id) return [];

  try {
    const playground = await findPlaygroundsForUserWithOwnerAndStar(user.id);

    return playground;
  } catch (error) {
    console.log(error);
  }
};

export const createPlayground = async (data: {
  title: string;
  template: "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "ANGULAR" | "HONO" | "NODE";
  description?: string;
}) => {
  const user = await currentUser();
  if (!user || !user.id) {
    return { error: "Unauthorized" };
  }

  const { template, title, description } = data;

  try {
    const existingProject = await findPlaygroundByUserAndTitle(user.id, title);

    if (existingProject) {
      return { error: "A project with this name already exists." };
    }

    const playground = await createPlaygroundRow({
      title: title,
      description: description,
      template: template,
      userId: user.id,
    });

    // Persist the starter scaffold into the SAME store autosave writes to,
    // synchronously, before this action returns — without this, a
    // never-edited project has no TemplateFile row at all, and publishing it
    // to GitHub before the user's first edit fails with "No file content
    // found" (the editor still looks fine because it separately regenerates
    // this same scaffold on demand client-side, but never persists it).
    // Reuses upsertTemplateFileForPlayground — the exact function
    // SaveUpdatedCode/autosave uses — rather than a second write path.
    try {
      const scaffold = await loadTemplateScaffold(template);
      const persisted = await upsertTemplateFileForPlayground(playground.id, JSON.stringify(scaffold));

      // Structural completeness check: re-read what actually landed in the
      // store and compare file counts against the scaffold we just built.
      // Not a per-file non-empty check — a template can legitimately ship an
      // intentionally empty file — this only catches the row silently ending
      // up missing/short, and logs loudly instead of surfacing as a confusing
      // push failure later.
      const persistedTree = typeof persisted.content === "string" ? JSON.parse(persisted.content) : persisted.content;
      const expectedCount = countTemplateFiles(scaffold);
      const actualCount = countTemplateFiles(persistedTree);
      if (actualCount !== expectedCount) {
        console.error(
          `[template-scaffold] Playground ${playground.id} (${template}): expected ${expectedCount} files, store has ${actualCount} after creation-time persist.`
        );
      }
    } catch (scaffoldError) {
      console.error(`[template-scaffold] Failed to persist starter files for playground ${playground.id}:`, scaffoldError);
    }

    revalidatePath("/dashboard");
    return { playground };
  } catch (error) {
    console.error("Error creating playground:", error);
    return { error: "Failed to create playground" };
  }
};

export const deleteProjectById = async (id: string) => {
  try {
    await deletePlaygroundCascade(id);
    revalidatePath("/dashboard");
  } catch (error) {
    console.log(error);
  }
};

export const editProjectById = async (
  id: string,
  data: { title: string; description: string }
) => {
  try {
    await updatePlayground(id, data);
    revalidatePath("/dashboard");
  } catch (error) {
    console.log(error);
  }
};

export const duplicateProjectById = async (id: string) => {
  try {
    const originalPlayground = await findPlaygroundById(id);
    if (!originalPlayground) {
      throw new Error("Original playground not found");
    }

    const duplicatedPlayground = await createPlaygroundRow({
      title: `${originalPlayground.title} (Copy)`,
      description: originalPlayground.description,
      template: originalPlayground.template,
      userId: originalPlayground.userId,

      // todo: add template files
    });

    revalidatePath("/dashboard");
    return duplicatedPlayground;
  } catch (error) {
    console.error("Error duplicating project:", error);
  }
};
