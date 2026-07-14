import type { TemplateFolder } from "./path-to-json";

/**
 * Plain (non-"use server") module on purpose: commit.ts's own "use server"
 * directive requires every export from that file to be an async Server
 * Action, so this synchronous lookup can't be exported from there — that
 * combination throws at build/runtime. Shared here instead by both
 * commit.ts's ignore matcher and create-repo.ts's "does this project already
 * have a .gitignore" check, so there's exactly one place that knows what a
 * ".gitignore" file node looks like in this tree shape.
 */
export function findRootGitignoreFile(
  tree: TemplateFolder | null
): { filename: string; fileExtension: string; content: string } | undefined {
  return tree?.items.find(
    (item): item is { filename: string; fileExtension: string; content: string } =>
      "filename" in item && item.filename === ".gitignore" && item.fileExtension === ""
  );
}
